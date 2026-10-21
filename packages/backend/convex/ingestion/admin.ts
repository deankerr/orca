import { mergedStream, stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { action, env, mutation, query } from '#generated/server'
import type { QueryCtx } from '#generated/server'
import * as scans from '#scans'

import { requireAdmin } from '../admin'
import { clock } from '../products/shared/clock'
import schema from '../schema'
import { ingestionParallelism } from './pool'
import { queueCapacity, retryFailed } from './queue'
import { recordCounts } from './records'
import { kickoff } from './sync'
import {
  INGESTION_RECORDS_TABLE,
  INGESTION_TARGET_TABLE,
  ingestionTargetRange,
  recordKind,
  recordState,
} from './tables'
import type { RecordKind, RecordState } from './tables'
import { setTarget } from './target'

/** Most histogram buckets per request: buckets × states bounded counts. */
export const HISTOGRAM_BUCKETS_LIMIT = 240

const BASELINE_LIMIT = 8

const namespaces = recordKind.members.flatMap((kind) =>
  recordState.members.map((state): [RecordKind, RecordState] => [kind.value, state.value]),
)

const scanAt = v.union(v.null(), v.string())

/** Everything the dashboard header needs, from indexed edges and aggregate totals. */
export const overview = query({
  args: {},
  returns: v.object({
    target: v.union(v.null(), ingestionTargetRange),
    counts: v.record(v.string(), v.number()),
    pairs: v.object({ earliest: scanAt, latest: scanAt }),
    baselines: v.array(v.object({ scan_at: v.string(), state: recordState })),
    frontier: scanAt,
    latestCompleteFull: scanAt,
    clock: scanAt,
    automation: v.object({ cron: v.boolean(), discord: v.boolean() }),
    execution: v.object({ parallelism: v.number(), capacity: v.number() }),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const target = await ctx.db.query(INGESTION_TARGET_TABLE).unique()
    const totals = await recordCounts.countBatch(
      ctx,
      namespaces.map((namespace) => ({ namespace })),
      { stale: true },
    )
    const pairs = () =>
      ctx.db
        .query(INGESTION_RECORDS_TABLE)
        .withIndex('by_kind_and_scan_at', (q) => q.eq('kind', 'pair'))
    const earliest = await pairs().order('asc').first()
    const newest = await pairs().order('desc').first()
    // The queue accepts newest first, so the newest pending pair marks how far it has reached.
    const frontier = await latest(ctx, 'pending')
    const full = await ctx.db
      .query(INGESTION_RECORDS_TABLE)
      .withIndex('by_current_scope_and_state_and_scan_at', (q) =>
        q.eq('current_scope', 'full').eq('state', 'complete'),
      )
      .order('desc')
      .first()
    const baselines = await ctx.db
      .query(INGESTION_RECORDS_TABLE)
      .withIndex('by_kind_and_scan_at', (q) => q.eq('kind', 'baseline'))
      .take(BASELINE_LIMIT)

    return {
      target: target === null ? null : { start_at: target.start_at, end_at: target.end_at },
      counts: Object.fromEntries(
        namespaces.map((namespace, index) => [namespace.join('/'), totals[index] ?? 0]),
      ),
      pairs: { earliest: earliest?.scan_at ?? null, latest: newest?.scan_at ?? null },
      baselines: baselines.map(({ scan_at, state }) => ({ scan_at, state })),
      frontier: frontier?.scan_at ?? null,
      latestCompleteFull: full?.scan_at ?? null,
      clock: await clock(ctx),
      automation: {
        cron: env.ORCA_INGESTION_CRON_ENABLED === 'true',
        discord: env.ORCA_DISCORD_AUTO_SEND_ENABLED === 'true',
      },
      execution: { parallelism: ingestionParallelism(), capacity: queueCapacity() },
    }
  },
})

async function latest(ctx: QueryCtx, state: RecordState) {
  return await ctx.db
    .query(INGESTION_RECORDS_TABLE)
    .withIndex('by_kind_and_state_and_scan_at', (q) => q.eq('kind', 'pair').eq('state', state))
    .order('desc')
    .first()
}

/**
 * Pair counts per state in equal time buckets over `[start_at, end_at]`. Each count is a
 * bounded aggregate read, so cost depends on bucket count, not on how many records exist.
 */
export const histogram = query({
  args: { start_at: v.string(), end_at: v.string(), buckets: v.number() },
  returns: v.object({
    edges: v.array(v.string()),
    counts: v.record(v.string(), v.array(v.number())),
  }),
  handler: async (ctx, { start_at, end_at, buckets }) => {
    await requireAdmin(ctx)
    const start = Date.parse(start_at)
    const end = Date.parse(end_at)

    if (
      !Number.isInteger(buckets) ||
      buckets < 1 ||
      buckets > HISTOGRAM_BUCKETS_LIMIT ||
      !(start < end)
    ) {
      throw new ConvexError('Invalid histogram range or bucket count')
    }

    const edges = Array.from({ length: buckets + 1 }, (_, index) =>
      new Date(start + ((end - start) * index) / buckets).toISOString(),
    )
    const states = recordState.members.map(({ value }) => value)
    const bounds = states.flatMap((state) =>
      edges.slice(0, -1).map((lower, index) => ({
        namespace: ['pair', state] as [RecordKind, RecordState],
        bounds: {
          lower: { key: lower, inclusive: true },
          // The final bucket includes the range end.
          upper: { key: edges[index + 1] ?? lower, inclusive: index === buckets - 1 },
        },
      })),
    )
    const totals = await recordCounts.countBatch(ctx, bounds, { stale: true })

    return {
      edges,
      counts: Object.fromEntries(
        states.map((state, row) => [
          state,
          totals.slice(row * buckets, (row + 1) * buckets).map((count) => count ?? 0),
        ]),
      ),
    }
  },
})

/** Records newest first, optionally in one state, starting before a chosen scan time. */
export const records = query({
  args: {
    state: v.optional(recordState),
    before: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { state, before, paginationOpts }) => {
    await requireAdmin(ctx)
    const records = stream(ctx.db, schema).query(INGESTION_RECORDS_TABLE)
    // A state filter covers both kinds, so failed baselines stay visible and retryable.
    const page = await (
      state === undefined
        ? records
            .withIndex('by_scan_at', (q) => (before === undefined ? q : q.lt('scan_at', before)))
            .order('desc')
        : mergedStream(
            recordKind.members.map(({ value: kind }) =>
              records
                .withIndex('by_kind_and_state_and_scan_at', (q) => {
                  const range = q.eq('kind', kind).eq('state', state)
                  return before === undefined ? range : range.lt('scan_at', before)
                })
                .order('desc'),
            ),
            ['scan_at', '_creationTime', '_id'],
          )
    ).paginate(paginationOpts)

    return {
      ...page,
      page: page.page.map(
        ({
          _id,
          kind,
          from_scan_at,
          scan_at,
          state,
          alerts,
          current_scope,
          current_stats,
          error,
        }) => ({
          _id,
          kind,
          from_scan_at,
          scan_at,
          state,
          alerts,
          current_scope: current_scope ?? null,
          current_stats: current_stats ?? null,
          error: error ?? null,
        }),
      ),
    }
  },
})

/** The object store's capture range: the earliest scan bounds a backfill, the latest shows lag. */
export const sourceScans = action({
  args: {},
  returns: v.object({ earliest: scanAt, latest: scanAt }),
  handler: async (ctx) => {
    await requireAdmin(ctx)
    const [earliest] = await scans.times(ctx, { limit: 1, order: 'asc' })
    return { earliest: earliest ?? null, latest: await scans.latest(ctx) }
  },
})

export const saveTarget = mutation({
  args: ingestionTargetRange.fields,
  returns: v.null(),
  handler: async (ctx, range) => {
    await requireAdmin(ctx)
    await setTarget(ctx, range)
    return null
  },
})

export const runSync = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAdmin(ctx)
    await kickoff(ctx)
    return null
  },
})

/** Reopen one failed record, or the next batch of failed records. */
export const retry = mutation({
  args: { record_id: v.optional(v.id(INGESTION_RECORDS_TABLE)) },
  returns: v.number(),
  handler: async (ctx, { record_id }) => {
    await requireAdmin(ctx)
    return await retryFailed(ctx, record_id)
  },
})
