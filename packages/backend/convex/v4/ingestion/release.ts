import { ConvexError } from 'convex/values'

import type { Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { clock } from '../clock'
import { assertScanPair } from '../scan/time'
import type { ScanPairTimes } from '../scan/time'
import { V4_INGESTIONS_TABLE, V4_PROCESSOR_WORK_TABLE } from './table'
import type { ProcessorName } from './table'

/** Call in the same transaction as prerequisite writes and work declarations; null means already released. */
export async function release(ctx: MutationCtx, pair: ScanPairTimes) {
  assertScanPair(pair.from_scan_at, pair.scan_at)
  const existing = await ctx.db
    .query(V4_INGESTIONS_TABLE)
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
  return await ctx.db.insert(V4_INGESTIONS_TABLE, pair)
}

/** The caller explicitly chooses which obligations accompany a newly released pair. */
export async function createWork(
  ctx: MutationCtx,
  ingestionId: Id<typeof V4_INGESTIONS_TABLE>,
  processor: ProcessorName,
) {
  const ingestion = await ctx.db.get(V4_INGESTIONS_TABLE, ingestionId)
  if (ingestion === null) {
    throw new ConvexError('Processor input is not released')
  }
  return await ctx.db.insert(V4_PROCESSOR_WORK_TABLE, {
    ingestion_id: ingestionId,
    processor,
    scan_at: ingestion.scan_at,
    state: 'pending',
  })
}

/** Require an accepted observation before publishing derived data. */
export async function assertReleasedScan(ctx: QueryCtx, scanAt: string): Promise<void> {
  const ingestion = await ctx.db
    .query(V4_INGESTIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
    .unique()
  if (ingestion === null) {
    throw new ConvexError({ message: 'Observation has not been released', scan_at: scanAt })
  }
}
