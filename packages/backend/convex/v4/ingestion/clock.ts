import type { QueryCtx } from '../../_generated/server'
import { assertScanAt } from '../scan/time'
import { V4_CURSORS_TABLE, V4_INGESTIONS_TABLE } from './table'
import type { ModuleName } from './table'

/** Latest declared pair's scan time, which the Catalog reflects; null before the first pair. */
export async function catalogScanAt(ctx: QueryCtx): Promise<string | null> {
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
 * Cap a requested cutoff at the module's cursor.
 * Output beyond it is unreadable, including baseline rows of an unfinished first pair.
 */
export async function cappedCutoff(
  ctx: QueryCtx,
  module: ModuleName,
  requested?: string,
): Promise<string | null> {
  if (requested !== undefined) {
    assertScanAt(requested)
  }

  const cursor = await findCursor(ctx, module)
  const clock = cursor?.scan_at ?? null

  if (clock === null) {
    return null
  }

  return requested !== undefined && requested < clock ? requested : clock
}
