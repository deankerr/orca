import { ConvexError, v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalAction } from '../../../_generated/server'
import type { ActionCtx } from '../../../_generated/server'
import { load } from '../../../objects'
import type { ScanRef } from '../../ingest/shared'
import { vScanRef } from '../../ingest/shared'
import { apply } from '../../projections/apply'
import { emptyCatalog, explode } from '../../projections/explode'

const vScanRefOrNull = v.union(vScanRef, v.null())

/**
 * Peek the latest-edge neighbor, load both artifacts, explode, compare, apply.
 *
 * Restarting this step re-peeks; an already-ingested neighbor is skipped.
 *
 * @returns The applied identity, or null if there is no neighbor.
 */
export const applyNext = internalAction({
  args: { path: v.string() },
  returns: vScanRefOrNull,
  handler: async (ctx, args): Promise<ScanRef | null> => {
    const beforeRef: ScanRef | null = await ctx.runQuery(internal.meps2.ingest.queries.latest, {
      path: args.path,
    })

    const afterRef: ScanRef | null = await ctx.runQuery(internal.meps2.ingest.queries.nextAfter, {
      path: args.path,
      scan_at: beforeRef?.scan_at ?? null,
    })

    if (afterRef === null) {
      return null
    }

    const after = explode(await loadScan(ctx, afterRef))

    const before = beforeRef === null ? emptyCatalog() : explode(await loadScan(ctx, beforeRef))

    await apply(ctx, { scan_at: afterRef.scan_at, before, after })
    return afterRef
  },
})

/** Registered scans must have a stored object. Missing is corruption. */
async function loadScan(ctx: ActionCtx, ref: ScanRef): Promise<string> {
  const text = await load(ctx, { path: ref.path, name: ref.artifact_id })

  if (text === null) {
    throw new ConvexError({
      message: 'object not found',
      path: ref.path,
      name: ref.artifact_id,
    })
  }

  return text
}
