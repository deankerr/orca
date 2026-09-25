import type { QueryCtx } from '../../_generated/server'
import { assertScanAt } from '../scan/time'
import { V4_CURSORS_TABLE, V4_INGESTIONS_TABLE } from './table'
import type { ModuleName } from './table'

/** Latest completed ingestion; null until the first pair commits. */
export async function ingestionScanAt(ctx: QueryCtx): Promise<string | null> {
  const latest = await ctx.db
    .query(V4_INGESTIONS_TABLE)
    .withIndex('by_scan_at')
    .order('desc')
    .first()
  return latest?.scan_at ?? null
}

export async function findCursor(ctx: QueryCtx, module: ModuleName) {
  return await ctx.db
    .query(V4_CURSORS_TABLE)
    .withIndex('by_module', (q) => q.eq('module', module))
    .unique()
}

/**
 * Pin reads to a released observation. This is an upper bound, not a completeness claim:
 * processors may have outstanding work below it, and complete later pairs first.
 */
export async function cappedCutoff(ctx: QueryCtx, requested?: string): Promise<string | null> {
  if (requested !== undefined) {
    assertScanAt(requested)
  }

  const clock = await ingestionScanAt(ctx)

  if (clock === null) {
    return null
  }

  return requested !== undefined && requested < clock ? requested : clock
}
