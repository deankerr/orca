import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import type { ScanRef } from '../../ingest/shared'
import { workflow } from '../manager'

/** Neighbors applied per drain run. Knob, not a contract. */
export const BATCH = 20

/** Lock key for this workflow on one timeline. */
export function lockKey(path: string) {
  return `drain:${path}`
}

/**
 * Drain registered-not-ingested files on the latest edge.
 *
 * Each apply step re-peeks `nextAfter(latest)`. Completes after `BATCH`
 * neighbors or when the peek is null. onComplete starts another drain if work
 * remains.
 */
export const drain = workflow
  .define({
    args: { path: v.string() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    for (let i = 0; i < BATCH; i += 1) {
      const applied: ScanRef | null = await step.runAction(
        internal.meps2.orchestrate.drain.apply.applyNext,
        { path: args.path },
        { retry: false, name: 'apply' },
      )

      if (applied === null) {
        break
      }

      await step.runMutation(
        internal.meps2.ingest.mutations.markIngested,
        { path: applied.path, scan_at: applied.scan_at },
        { inline: true, name: 'markIngested' },
      )
    }
    return null
  })
