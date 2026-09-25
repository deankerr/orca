import { ConvexError } from 'convex/values'

import type { Doc, Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { V4_INGESTIONS_TABLE, V4_PROCESSOR_WORK_TABLE } from './table'
import type { ProcessorName } from './table'

export async function findWork(
  ctx: QueryCtx,
  ingestionId: Id<typeof V4_INGESTIONS_TABLE>,
  processor: ProcessorName,
) {
  return await ctx.db
    .query(V4_PROCESSOR_WORK_TABLE)
    .withIndex('by_ingestion_id_and_processor', (q) =>
      q.eq('ingestion_id', ingestionId).eq('processor', processor),
    )
    .unique()
}

/** Read in the payload transaction: concurrent attempts conflict on this record. */
export async function pendingWork(
  ctx: QueryCtx,
  workId: Id<typeof V4_PROCESSOR_WORK_TABLE>,
  processor: ProcessorName,
): Promise<Doc<typeof V4_PROCESSOR_WORK_TABLE> | null> {
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

  return work
}

/** Never call separately from the payload writes; failure must roll both back. */
export async function completeWork(ctx: MutationCtx, workId: Id<typeof V4_PROCESSOR_WORK_TABLE>) {
  await ctx.db.patch(V4_PROCESSOR_WORK_TABLE, workId, { state: 'complete' })
}

export function assertOutputScan(rows: { scan_at: string }[], scanAt: string) {
  if (rows.some((row) => row.scan_at !== scanAt)) {
    throw new ConvexError('Processor output does not match its ingestion scan')
  }
}
