import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalMutation } from '../../../_generated/server'
import type { MutationCtx } from '../../../_generated/server'
import type { ScanRef } from '../../ingest/shared'
import { SCAN_PATH } from '../../scan/scanArtifact'
import { isLockHeldError } from '../lock'
import { workflow } from '../manager'
import { lockKey } from './workflow'

/**
 * Start latest-edge drain. Dashboard/CLI entry to clear a blockage.
 *
 * No-op if a drain is already in flight or there is no neighbor.
 */
export const start = internalMutation({
  args: {
    path: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await startDrain(ctx, args.path ?? SCAN_PATH)
    return null
  },
})

/**
 * Claim the drain lock and start the workflow.
 *
 * No-op if there is no neighbor or the lock is already held.
 */
export async function startDrain(ctx: MutationCtx, path: string) {
  const latest: ScanRef | null = await ctx.runQuery(internal.meps2.ingest.queries.latest, {
    path,
  })

  const neighbor: ScanRef | null = await ctx.runQuery(internal.meps2.ingest.queries.nextAfter, {
    path,
    scan_at: latest?.scan_at ?? null,
  })

  if (neighbor === null) {
    return
  }

  try {
    await ctx.runMutation(internal.meps2.orchestrate.lock.claim, { key: lockKey(path) })
  } catch (error: unknown) {
    if (isLockHeldError(error)) {
      return
    }

    throw error
  }

  await workflow.start(
    ctx,
    internal.meps2.orchestrate.drain.workflow.drain,
    { path },
    {
      onComplete: internal.meps2.orchestrate.drain.onComplete.onComplete,
      context: { path },
    },
  )
}
