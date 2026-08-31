import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalAction } from '../../../_generated/server'
import { load } from '../../artifacts/storage'
import type { ScanRef } from '../../ingest/shared'
import { vScanRef } from '../../ingest/shared'
import { apply } from '../../projections/apply'
import { emptyCatalog, explode } from '../../projections/explode'

const vScanRefOrNull = v.union(vScanRef, v.null())

/**
 * Peek the latest-edge neighbor, load both artifacts, explode, compare, apply.
 *
 * Does not take a caller-supplied `artifact_id` as `after`. Restarting this
 * step re-peeks; an already-ingested neighbor is skipped on the next peek.
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

    const afterBytes = await load(ctx, {
      path: afterRef.path,
      artifact_id: afterRef.artifact_id,
    })
    const after = explode(afterBytes)
    const before =
      beforeRef === null
        ? emptyCatalog()
        : explode(
            await load(ctx, {
              path: beforeRef.path,
              artifact_id: beforeRef.artifact_id,
            }),
          )

    await apply(ctx, { scan_at: afterRef.scan_at, before, after })
    return afterRef
  },
})
