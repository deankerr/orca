import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'

import { internal } from '#generated/api'
import type { Id } from '#generated/dataModel'
import { internalMutation } from '#generated/server'
import type { MutationCtx, QueryCtx } from '#generated/server'

import { decideQueue } from './decide'
import type { IngestRequest, QueueView } from './decide'
import { ingestionParallelism, pool } from './pool'
import { recordCounts, writeRecords } from './records'
import type { RecordWrites } from './records'
import { INGESTION_RECORDS_TABLE, QUEUE_SCHEDULE_TABLE } from './tables'
import type { RecordKind, RecordState } from './tables'

type RecordId = Id<typeof INGESTION_RECORDS_TABLE>

/** Maximum pairs accepted for execution per queue step. */
export const QUEUE_BATCH = 24

/**
 * Maximum accepted records unfinished at once, a few times Workpool parallelism. The rest stay
 * pending, so retries and withdrawals never wait behind a whole backfill in Workpool's backlog.
 */
export function queueCapacity(): number {
  return 4 * ingestionParallelism()
}

/** Maximum failed records reopened per retry-all call; repeat until it returns 0. */
export const RETRY_BATCH = 256

/** More would be an invalid registry; the queue worker then waits rather than guessing. */
const BASELINE_LIMIT = 8

/** Schedule a queue step unless one is already waiting to start; a running step does not count. */
export async function scheduleQueue(ctx: MutationCtx) {
  const schedule = await ctx.db.query(QUEUE_SCHEDULE_TABLE).unique()
  const waiting =
    schedule === null
      ? null
      : await ctx.db.system.get('_scheduled_functions', schedule.scheduled_id)

  if (waiting?.state.kind === 'pending') {
    return
  }

  const scheduled_id = await ctx.scheduler.runAfter(0, internal.ingestion.queue.run, {})

  await (schedule === null
    ? ctx.db.insert(QUEUE_SCHEDULE_TABLE, { scheduled_id })
    : ctx.db.patch(QUEUE_SCHEDULE_TABLE, schedule._id, { scheduled_id }))
}

/** One queue step: commit the first selection that finds work, then run again until idle. */
export const run = internalMutation({
  args: {},
  returns: literals('withdraw', 'ingest', 'baseline', 'idle'),
  handler: async (ctx) => {
    const decision = decideQueue(await readView(ctx), {
      batch: QUEUE_BATCH,
      capacity: queueCapacity(),
    })

    if (decision.kind === 'idle') {
      return decision.kind
    }

    await writeRecords(ctx, async (records) => {
      if (decision.kind === 'withdraw') {
        await withdraw(ctx, records, decision.ids)
      } else if (decision.kind === 'ingest') {
        await ingest(ctx, records, decision.requests)
      } else {
        // A baseline's candidates are complete; it records no scope, so it never counts as a full pair.
        await ingest(ctx, records, [{ id: decision.id, scope: 'full', current_stats: false }])
      }
    })

    await scheduleQueue(ctx)
    return decision.kind
  },
})

async function readView(ctx: QueryCtx): Promise<QueueView<RecordId>> {
  const byKind = (kind: RecordKind) =>
    ctx.db
      .query(INGESTION_RECORDS_TABLE)
      .withIndex('by_kind_and_scan_at', (q) => q.eq('kind', kind))
  const latestFull = async (state: RecordState) =>
    scanAt(
      await ctx.db
        .query(INGESTION_RECORDS_TABLE)
        .withIndex('by_current_scope_and_state_and_scan_at', (q) =>
          q.eq('current_scope', 'full').eq('state', state),
        )
        .order('desc')
        .first(),
    )

  const baselineRecords = await byKind('baseline').take(BASELINE_LIMIT)
  const baselines = await Promise.all(
    baselineRecords.map(async ({ _id, scan_at, state }) => ({
      id: _id,
      scan_at,
      state,
      displaced:
        (await ctx.db
          .query(INGESTION_RECORDS_TABLE)
          .withIndex('by_kind_and_scan_at', (q) => q.eq('kind', 'pair').eq('scan_at', scan_at))
          .first()) !== null,
    })),
  )
  const latestQueuedFull = await latestFull('queued')
  const latestCompleteFull = await latestFull('complete')
  const pending = await ctx.db
    .query(INGESTION_RECORDS_TABLE)
    .withIndex('by_kind_and_state_and_scan_at', (q) => {
      const range = q.eq('kind', 'pair').eq('state', 'pending')
      return latestQueuedFull === null ? range : range.gt('scan_at', latestQueuedFull)
    })
    .order('desc')
    .take(QUEUE_BATCH + baselines.length)

  return {
    baselines,
    pending: pending.map(({ _id, scan_at }) => ({ id: _id, scan_at })),
    latestCompleteFull,
    hasFull: latestQueuedFull !== null || latestCompleteFull !== null,
    latestPair: scanAt(await byKind('pair').order('desc').first()),
    pairsUnsettled:
      (await byState(ctx, 'pair', 'pending').first()) !== null ||
      (await byState(ctx, 'pair', 'queued').first()) !== null,
    inFlight: await inFlight(ctx),
  }
}

/**
 * Unfinished accepted records, from the aggregate's stale snapshot. Reading the records would
 * conflict with every completion; the stale count only lets the capacity overshoot briefly.
 */
async function inFlight(ctx: QueryCtx): Promise<number> {
  const counts = await recordCounts.countBatch(
    ctx,
    (['pair', 'baseline'] as const).flatMap((kind) =>
      (['queued', 'withdrawing'] as const).map((state) => ({
        namespace: [kind, state] as [RecordKind, RecordState],
      })),
    ),
    { stale: true },
  )
  return counts.reduce((sum, value) => sum + value, 0)
}

function byState(ctx: QueryCtx, kind: RecordKind, state: RecordState) {
  return ctx.db
    .query(INGESTION_RECORDS_TABLE)
    .withIndex('by_kind_and_state_and_scan_at', (q) => q.eq('kind', kind).eq('state', state))
}

function scanAt(record: { scan_at: string } | null): string | null {
  return record?.scan_at ?? null
}

/** Load the requested records that still exist, in request order. */
async function load<Request extends { id: RecordId }>(ctx: QueryCtx, requests: Request[]) {
  const loaded = await Promise.all(
    requests.map(async (request) => ({
      request,
      record: await ctx.db.get(INGESTION_RECORDS_TABLE, request.id),
    })),
  )
  return loaded.flatMap(({ request, record }) => (record === null ? [] : [{ request, record }]))
}

/**
 * Accept requests and mark their records queued in the same transaction. One Workpool batch
 * keeps a step's cost flat; completions find their record by work ID, so no per-item context.
 */
async function ingest(
  ctx: MutationCtx,
  records: RecordWrites,
  requests: IngestRequest<RecordId>[],
) {
  const accepted = await load(ctx, requests)
  const workIds = await pool().enqueueActionBatch(
    ctx,
    internal.ingestion.execute.ingest,
    accepted.map(({ request: { scope, current_stats }, record: { from_scan_at, scan_at } }) => ({
      from_scan_at,
      scan_at,
      scope,
      current_stats,
    })),
    { onComplete: internal.ingestion.execute.onIngested },
  )

  // Independent writes run concurrently; sequential awaits dominated the step's duration.
  await Promise.all(
    accepted.map(async ({ request, record }, index) => {
      await records.patch(record, {
        state: 'queued',
        ...(record.kind === 'pair'
          ? { current_scope: request.scope, current_stats: request.current_stats }
          : {}),
        work_id: workIds[index],
        error: undefined,
      })
    }),
  )
}

async function withdraw(ctx: MutationCtx, records: RecordWrites, ids: RecordId[]) {
  const accepted = await load(
    ctx,
    ids.map((id) => ({ id })),
  )
  const workIds = await pool().enqueueActionBatch(
    ctx,
    internal.ingestion.execute.withdraw,
    accepted.map(({ record: { scan_at } }) => ({ scan_at })),
    { onComplete: internal.ingestion.execute.onWithdrawn },
  )

  await Promise.all(
    accepted.map(async ({ record }, index) => {
      await records.patch(record, {
        state: 'withdrawing',
        work_id: workIds[index],
        error: undefined,
      })
    }),
  )
}

/** Return failed records to pending; each receives a fresh scope when queued again. */
export const retry = internalMutation({
  args: { record_id: v.optional(v.id(INGESTION_RECORDS_TABLE)) },
  returns: v.number(),
  handler: async (ctx, { record_id }) => await retryFailed(ctx, record_id),
})

/** Reopen one failed record, or up to `RETRY_BATCH` of them; returns how many were reopened. */
export async function retryFailed(ctx: MutationCtx, record_id?: RecordId): Promise<number> {
  const failed =
    record_id === undefined
      ? [
          ...(await byState(ctx, 'baseline', 'failed').take(RETRY_BATCH)),
          ...(await byState(ctx, 'pair', 'failed').take(RETRY_BATCH)),
        ].slice(0, RETRY_BATCH)
      : [await ctx.db.get(INGESTION_RECORDS_TABLE, record_id)].filter(
          (record) => record?.state === 'failed',
        )

  await writeRecords(ctx, async (records) => {
    await Promise.all(
      failed.map(async (record) => {
        if (record !== null) {
          await records.patch(record, {
            state: 'pending',
            current_scope: undefined,
            current_stats: undefined,
            work_id: undefined,
          })
        }
      }),
    )
  })

  if (failed.length > 0) {
    await scheduleQueue(ctx)
  }
  return failed.length
}
