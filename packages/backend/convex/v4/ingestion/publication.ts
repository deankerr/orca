import { ConvexError } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { assertScanAt } from '../scan/time'
import { V4_CURSORS_TABLE, V4_INGESTIONS_TABLE } from './table'
import type { ModuleName } from './table'

async function findCursor(ctx: QueryCtx, module: ModuleName) {
  return await ctx.db
    .query(V4_CURSORS_TABLE)
    .withIndex('by_module', (q) => q.eq('module', module))
    .unique()
}

export async function publicationScanAt(ctx: QueryCtx, module: ModuleName) {
  const cursor = await findCursor(ctx, module)
  return cursor?.scan_at ?? null
}

/** Check inside the snapshot transaction so a concurrent newer publication cannot be overwritten. */
export async function pendingPublication(ctx: QueryCtx, module: ModuleName, scanAt: string) {
  assertScanAt(scanAt)
  const published = await publicationScanAt(ctx, module)
  if (published !== null && published >= scanAt) {
    return false
  }
  const ingestion = await ctx.db
    .query(V4_INGESTIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
    .unique()
  if (ingestion === null) {
    throw new ConvexError('Publication observation has not been released')
  }
  return true
}

/** Commit with the snapshot writes, never separately. */
export async function completePublication(ctx: MutationCtx, module: ModuleName, scanAt: string) {
  const cursor = await findCursor(ctx, module)
  await (cursor === null
    ? ctx.db.insert(V4_CURSORS_TABLE, { module, scan_at: scanAt })
    : ctx.db.patch(V4_CURSORS_TABLE, cursor._id, { scan_at: scanAt }))
}
