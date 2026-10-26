import { TableAggregate } from '@convex-dev/aggregate'
import type { TableAggregateOperation } from '@convex-dev/aggregate'
import type { WithoutSystemFields } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import * as R from 'remeda'

import { components, internal } from '#generated/api'
import type { DataModel, Doc, Id } from '#generated/dataModel'
import { env, internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx, QueryCtx } from '#generated/server'

import { INGESTION_RECORDS_TABLE, recordKind, recordState } from './tables'
import type { RecordKind, RecordState } from './tables'

type RecordDoc = Doc<typeof INGESTION_RECORDS_TABLE>

type RecordId = Id<typeof INGESTION_RECORDS_TABLE>

/**
 * Record counts by kind and state over scan time. A derived index over `ingestion_records`,
 * rebuildable from it. Each namespace is its own tree, so state transitions touch two trees.
 */
type RecordCountsType = {
  Namespace: [RecordKind, RecordState]
  Key: string
  DataModel: DataModel
  TableName: typeof INGESTION_RECORDS_TABLE
}

export const recordCounts = new TableAggregate<RecordCountsType>(components.ingestionRecordCounts, {
  namespace: (record) => [record.kind, record.state],
  sortKey: (record) => record.scan_at,
})

type RecordKeyField = 'from_scan_at' | 'kind' | 'scan_at'

/** Convex's patch shape: `undefined` on an optional field removes it. */
type Patch<T> = { [P in keyof T]?: undefined extends T[P] ? T[P] | undefined : T[P] }

// Forbids the fields recordCounts keys on (kind, scan_at), and from_scan_at, which determines kind.
// `never` rejects them from variables and spreads too, which `Omit` alone would allow.
type RecordPatch = Patch<Omit<WithoutSystemFields<RecordDoc>, RecordKeyField>> &
  Partial<Record<RecordKeyField, never>>

export type RecordWrites = {
  insert: (record: WithoutSystemFields<RecordDoc>) => Promise<RecordId>
  patch: (previous: RecordDoc, patch: RecordPatch) => Promise<void>
  delete: (record: RecordDoc) => Promise<void>
}

/**
 * Every record write goes through `write`, keeping `recordCounts` in step with the table.
 * Aggregate updates are queued, so concurrent completions never contend on shared tree nodes,
 * and enqueued once per transaction: each enqueue rewrites the component's pending entry.
 */
export async function writeRecords<Result>(
  ctx: MutationCtx,
  write: (records: RecordWrites) => Promise<Result>,
): Promise<Result> {
  const operations: TableAggregateOperation<RecordCountsType>[] = []

  const result = await write({
    delete: async (record) => {
      await ctx.db.delete(INGESTION_RECORDS_TABLE, record._id)
      operations.push({ doc: record, type: 'delete' })
    },
    insert: async (record) => {
      const id = await ctx.db.insert(INGESTION_RECORDS_TABLE, record)
      const doc = await ctx.db.get(INGESTION_RECORDS_TABLE, id)

      if (doc !== null) {
        operations.push({ doc, type: 'insert' })
      }

      return id
    },
    patch: async (previous, patch) => {
      await ctx.db.patch(INGESTION_RECORDS_TABLE, previous._id, patch)

      // RecordPatch cannot change kind or scan_at, so only a state change can move the aggregate entry.
      if (patch.state !== undefined && patch.state !== previous.state) {
        // An `undefined` patch value removes its field.
        const newDoc = R.pickBy({ ...previous, ...patch }, R.isDefined)
        operations.push({ newDoc, oldDoc: previous, type: 'replace' })
      }
    },
  })

  if (operations.length > 0) {
    await recordCounts.enqueueBatch(ctx, operations)
  }

  return result
}

/** Record totals by `kind/state`, from a stale snapshot that may trail queued writes. */
export const counts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const keys = recordKind.members.flatMap((kind) =>
      recordState.members.map((state): [RecordKind, RecordState] => [kind.value, state.value]),
    )

    const totals = await recordCounts.countBatch(
      ctx,
      keys.map((namespace) => ({ namespace })),
      { stale: true },
    )

    return Object.fromEntries(keys.map((key, index) => [key.join('/'), totals[index] ?? 0]))
  },
  returns: v.record(v.string(), v.number()),
})

/** Whether any ingestion record exists, read from the table rather than the aggregate counts. */
export const exists = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query(INGESTION_RECORDS_TABLE).first()) !== null,
  returns: v.boolean(),
})

/** Dead-lettered aggregate operations, counted up to `limit`: each one is a missed count change. */
export async function deadLetteredCount(ctx: QueryCtx, limit: number) {
  const { page } = await ctx.runQuery(components.ingestionRecordCounts.deadLetter.list, {
    paginationOpts: { cursor: null, numItems: limit },
  })

  return page.length
}

/** Records inserted per rebuild transaction. */
const REBUILD_BATCH = 200

/** Rebuild is only correct while no record write can enqueue an operation behind it. */
async function assertQuiescent(ctx: MutationCtx) {
  if (env.ORCA_INGESTION_CRON_ENABLED === 'true') {
    throw new ConvexError('Disable ORCA_INGESTION_CRON_ENABLED before rebuilding record counts')
  }

  for (const { value: kind } of recordKind.members) {
    for (const state of ['queued', 'withdrawing'] as const) {
      const accepted = await ctx.db
        .query(INGESTION_RECORDS_TABLE)
        .withIndex('by_kind_and_state_and_scan_at', (q) => q.eq('kind', kind).eq('state', state))
        .first()

      if (accepted !== null) {
        throw new ConvexError(
          `Cannot rebuild record counts while ${kind} records are ${state}: wait for them to settle`,
        )
      }
    }
  }
}

/**
 * Rebuild `recordCounts` from `ingestion_records`, for use when the counts have drifted (see the
 * dead-letter count in the admin overview). Run with `npx convex run ingestion/records:rebuildCounts`
 * while the cron is disabled and no sync or retry is triggered. Unlike writers, rebuild applies
 * operations synchronously, so the component refuses it while queued operations are pending.
 */
export const rebuildCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    await assertQuiescent(ctx)
    // Throws while operations are pending, aborting before anything is cleared.
    await recordCounts.clearAll(ctx)

    // Dead letters describe the counts just discarded; clear them in pages before reinserting.
    await ctx.scheduler.runAfter(0, internal.ingestion.records.rebuildCountsDeadLetters, {})
  },
  returns: v.null(),
})

/** One bounded page of dead-letter deletion; continues until none remain, then starts the record pages. */
export const rebuildCountsDeadLetters = internalMutation({
  args: {},
  handler: async (ctx) => {
    await assertQuiescent(ctx)

    const { page } = await ctx.runQuery(components.ingestionRecordCounts.deadLetter.list, {
      paginationOpts: { cursor: null, numItems: REBUILD_BATCH },
    })

    await Promise.all(
      page.map(
        async ({ _id }) =>
          await ctx.runMutation(components.ingestionRecordCounts.deadLetter.delete_, { id: _id }),
      ),
    )

    if (page.length === REBUILD_BATCH) {
      await ctx.scheduler.runAfter(0, internal.ingestion.records.rebuildCountsDeadLetters, {})

      return
    }

    await ctx.scheduler.runAfter(0, internal.ingestion.records.rebuildCountsPage, {
      cursor: null,
      inserted: 0,
    })
  },
  returns: v.null(),
})

/** One bounded page of the rebuild; schedules the next until the table is exhausted. */
export const rebuildCountsPage = internalMutation({
  args: { cursor: v.union(v.null(), v.string()), inserted: v.number() },
  handler: async (ctx, { cursor, inserted }) => {
    await assertQuiescent(ctx)

    const { page, continueCursor, isDone } = await ctx.db
      .query(INGESTION_RECORDS_TABLE)
      .paginate({ cursor, numItems: REBUILD_BATCH })

    for (const record of page) {
      await recordCounts.insertIfDoesNotExist(ctx, record)
    }

    const total = inserted + page.length

    if (isDone) {
      console.log(`Rebuilt record counts from ${total} records`)
    } else {
      await ctx.scheduler.runAfter(0, internal.ingestion.records.rebuildCountsPage, {
        cursor: continueCursor,
        inserted: total,
      })
    }
  },
  returns: v.null(),
})
