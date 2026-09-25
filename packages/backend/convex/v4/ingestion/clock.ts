import type { QueryCtx } from '../../_generated/server'
import { assertScanAt } from '../scan/time'
import { V4_INGESTIONS_TABLE } from './table'

/** Greatest completed output time, or null before the first pair finishes. */
export async function currentScanAt(ctx: QueryCtx): Promise<string | null> {
  const latest = await ctx.db
    .query(V4_INGESTIONS_TABLE)
    .withIndex('by_status_and_scan_at', (q) => q.eq('status', 'complete'))
    .order('desc')
    .first()

  return latest?.scan_at ?? null
}

/**
 * Cap a requested cutoff at the completed clock.
 * In-progress output stays unreadable, including baseline rows of an unfinished first pair.
 */
export async function cappedCutoff(ctx: QueryCtx, requested?: string): Promise<string | null> {
  if (requested !== undefined) {
    assertScanAt(requested)
  }
  const clock = await currentScanAt(ctx)

  if (clock === null) {
    return null
  }

  return requested !== undefined && requested < clock ? requested : clock
}
