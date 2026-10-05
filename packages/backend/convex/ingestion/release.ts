import { ConvexError } from 'convex/values'

import type { Id } from '#generated/dataModel'
import type { MutationCtx } from '#generated/server'

import { clock } from '../clock'
import type { IngestionRow, ProcessorName } from './table'
import { INGESTIONS_TABLE, PROCESSOR_WORK_TABLE } from './table'

/** Call in the same transaction as prerequisite writes and work declarations; null means already released. */
export async function release(ctx: MutationCtx, pair: IngestionRow) {
  if (pair.scan_at <= pair.from_scan_at) {
    throw new ConvexError('Scan pair must move forward in canonical time')
  }

  const existing = await ctx.db
    .query(INGESTIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', pair.scan_at))
    .unique()

  if (existing !== null) {
    if (existing.from_scan_at !== pair.from_scan_at) {
      throw new ConvexError('Ingestion pair does not match the released input')
    }

    return null
  }

  const scanAt = await clock(ctx)

  if (scanAt !== null && scanAt !== pair.from_scan_at) {
    throw new ConvexError({ message: 'Pair does not follow the observation clock', clock: scanAt })
  }

  return await ctx.db.insert(INGESTIONS_TABLE, pair)
}

/** The caller explicitly chooses which obligations accompany a newly released pair. */
export async function createWork(
  ctx: MutationCtx,
  ingestionId: Id<typeof INGESTIONS_TABLE>,
  processor: ProcessorName,
) {
  const ingestion = await ctx.db.get(INGESTIONS_TABLE, ingestionId)

  if (ingestion === null) {
    throw new ConvexError('Processor input is not released')
  }

  return await ctx.db.insert(PROCESSOR_WORK_TABLE, {
    ingestion_id: ingestionId,
    scan_at: ingestion.scan_at,
    state: 'pending',
    processor,
  })
}
