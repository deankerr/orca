import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import { internalQuery } from '../../_generated/server'
import type { QueryCtx } from '../../_generated/server'
import { COMPLETE_PHASE, INGESTION_PLAN } from './phases'
import { V4_INGESTIONS_TABLE } from './table'

/** Greatest completed output time, or null before the first pair finishes. */
export async function currentScanAt(ctx: QueryCtx): Promise<string | null> {
  const latest = await ctx.db
    .query(V4_INGESTIONS_TABLE)
    .withIndex('by_phase_and_scan_at', (q) => q.eq('phase', COMPLETE_PHASE))
    .order('desc')
    .first()

  return latest?.scan_at ?? null
}

/**
 * Cap a requested cutoff at the completed clock.
 * In-progress output stays unreadable, including baseline rows of an unfinished first pair.
 */
export async function cappedCutoff(ctx: QueryCtx, requested?: string): Promise<string | null> {
  const clock = await currentScanAt(ctx)

  if (clock === null) {
    return null
  }

  return requested !== undefined && requested < clock ? requested : clock
}

/** An unfinished plan phase. Deployments are expected to leave these idle. */
export async function findActiveIngestion(
  ctx: QueryCtx,
): Promise<Doc<typeof V4_INGESTIONS_TABLE> | null> {
  for (const phase of INGESTION_PLAN) {
    const active = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_phase_and_scan_at', (q) => q.eq('phase', phase))
      .first()

    if (active !== null) {
      return active
    }
  }

  return null
}

/** Read the ORCA clock. */
export const current = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => await currentScanAt(ctx),
})
