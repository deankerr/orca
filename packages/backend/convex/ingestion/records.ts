import { TableAggregate } from '@convex-dev/aggregate'
import type { TableAggregateOperation } from '@convex-dev/aggregate'
import type { WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'

import { components } from '#generated/api'
import type { DataModel, Doc, Id } from '#generated/dataModel'
import { internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

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

// Excludes the fields recordCounts keys on (kind, scan_at); from_scan_at is excluded because it determines kind.
type RecordPatch = Partial<
  Omit<WithoutSystemFields<RecordDoc>, 'from_scan_at' | 'kind' | 'scan_at'>
>

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
        operations.push({ newDoc: { ...previous, ...patch }, oldDoc: previous, type: 'replace' })
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
