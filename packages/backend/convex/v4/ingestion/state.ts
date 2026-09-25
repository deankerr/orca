import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { ScanPair } from '../scan'
import { assertScanPair } from '../scan/time'
import { catalogScanAt, findCursor } from './clock'
import { V4_CURSORS_TABLE, V4_INGESTIONS_TABLE } from './table'
import type { ModuleName } from './table'

/** Declare the next pair; only the clock's successor, or the first pair of an empty stream. */
export async function declarePair(
  ctx: MutationCtx,
  pair: ScanPair,
  { baseline }: { baseline: boolean },
): Promise<void> {
  assertScanPair(pair.from_scan_at, pair.scan_at)
  const clock = await catalogScanAt(ctx)

  if (baseline ? clock !== null : clock !== pair.from_scan_at) {
    throw new ConvexError({ message: 'Pair does not follow the clock', clock, ...pair })
  }

  await ctx.db.insert(V4_INGESTIONS_TABLE, pair)
}

/** Initialization writes are refused once the first pair is declared. */
export async function assertUninitialized(ctx: QueryCtx): Promise<void> {
  if ((await catalogScanAt(ctx)) !== null) {
    throw new ConvexError('Catalog is already initialized')
  }
}

/** Begin following the stream from its baseline. */
export async function createModuleCursor(ctx: MutationCtx, module: ModuleName): Promise<void> {
  if ((await findCursor(ctx, module)) !== null) {
    throw new ConvexError({ message: 'Module already started', module })
  }

  await ctx.db.insert(V4_CURSORS_TABLE, { module, scan_at: null })
}

/** A module's next step toward the clock; a null `from_scan_at` needs only the `scan_at` scan. */
export async function nextModuleStep(
  ctx: QueryCtx,
  module: ModuleName,
  { latestOnly }: { latestOnly: boolean },
) {
  const cursor = await findCursor(ctx, module)

  if (cursor === null) {
    throw new ConvexError({ message: 'Module not started', module })
  }

  const clock = await catalogScanAt(ctx)

  if (clock === null || cursor.scan_at === clock) {
    return null
  }

  if (latestOnly) {
    return { cursor: cursor.scan_at, from_scan_at: null, scan_at: clock }
  }

  const at = cursor.scan_at

  const pair = await (at === null
    ? ctx.db.query(V4_INGESTIONS_TABLE).withIndex('by_scan_at').first()
    : ctx.db
        .query(V4_INGESTIONS_TABLE)
        .withIndex('by_from_scan_at', (q) => q.eq('from_scan_at', at))
        .unique())

  if (pair === null) {
    throw new ConvexError({ message: 'Module cursor is not a declared scan', module, at })
  }

  return at === null
    ? { cursor: null, from_scan_at: null, scan_at: pair.from_scan_at }
    : { cursor: at, from_scan_at: pair.from_scan_at, scan_at: pair.scan_at }
}
