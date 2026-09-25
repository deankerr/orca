import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '../../_generated/api'
import type { MutationCtx } from '../../_generated/server'
import type { ExtractedScan } from '../scan'
import { V4_INGESTIONS_TABLE } from './table'

const execution = v.object({
  ingestionId: v.id(V4_INGESTIONS_TABLE),
  checkpoint: v.object({
    phase: v.string(),
    status: v.union(v.literal('running'), v.literal('complete')),
  }),
})

export const stepArgs = execution.fields

/** Execution identity supplied by the action; modules do not interpret progress. */
export type Execution = Infer<typeof execution>

export type ObservationPair = { previous: ExtractedScan | null; next: ExtractedScan }

/** Commit progress with data; durable completion also owns the next action's scheduling. */
export async function completeStep(ctx: MutationCtx, execution: Execution): Promise<null> {
  await ctx.db.patch(V4_INGESTIONS_TABLE, execution.ingestionId, execution.checkpoint)
  if (execution.checkpoint.status === 'complete') {
    await ctx.scheduler.runAfter(0, internal.v4.ingestion.run, {})
  }
  return null
}
