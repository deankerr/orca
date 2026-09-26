import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { internalQuery } from '../../_generated/server'
import type { ScanPairTimes } from '../scan/time'
import {
  ingestionsTable,
  processorName,
  V4_INGESTIONS_TABLE,
  V4_PROCESSOR_WORK_TABLE,
} from './table'
import type { ProcessorName } from './table'

export const workId = v.id(V4_PROCESSOR_WORK_TABLE)
export type WorkId = Infer<typeof workId>

/** Resolve an outstanding obligation to exact input times; loading belongs to composition. */
export const getWorkInput = internalQuery({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE), processor: processorName },
  returns: v.union(v.null(), ingestionsTable.validator),
  handler: async (ctx, args) => {
    const work = await pendingWork(ctx, args.work_id, args.processor)
    if (work === null) {
      return null
    }
    return { from_scan_at: work.from_scan_at, scan_at: work.scan_at }
  },
})

/** Read in the payload transaction: concurrent attempts conflict on this record. */
export async function pendingWork(
  ctx: QueryCtx,
  workId: Id<typeof V4_PROCESSOR_WORK_TABLE>,
  processor: ProcessorName,
): Promise<(Doc<typeof V4_PROCESSOR_WORK_TABLE> & ScanPairTimes) | null> {
  const work = await ctx.db.get(V4_PROCESSOR_WORK_TABLE, workId)

  if (work === null || work.processor !== processor) {
    throw new ConvexError({ message: 'Processor work does not match', workId, processor })
  }

  if (work.state === 'complete') {
    return null
  }

  const ingestion = await ctx.db.get(V4_INGESTIONS_TABLE, work.ingestion_id)

  if (ingestion === null || ingestion.scan_at !== work.scan_at) {
    throw new ConvexError({ message: 'Processor input is not released', workId })
  }

  return { ...work, from_scan_at: ingestion.from_scan_at }
}

/** Never call separately from the payload writes; failure must roll both back. */
export async function completeWork(ctx: MutationCtx, workId: Id<typeof V4_PROCESSOR_WORK_TABLE>) {
  await ctx.db.patch(V4_PROCESSOR_WORK_TABLE, workId, { state: 'complete' })
}

/** Bind even empty output to the exact pair recorded by the obligation. */
export function assertWorkOutput(
  work: ScanPairTimes,
  input: ScanPairTimes,
  rows: { scan_at: string }[],
) {
  if (
    input.from_scan_at !== work.from_scan_at ||
    input.scan_at !== work.scan_at ||
    rows.some((row) => row.scan_at !== work.scan_at)
  ) {
    throw new ConvexError('Processor output does not match its ingestion pair')
  }
}
