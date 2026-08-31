import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import type { ScanRef } from '../../ingest/shared'
import { workflow } from '../manager'

/** Lock key for this workflow. Not shared with drain. */
export const LOCK_KEY = 'observe'

/**
 * Scan+store, register, then start drain if none is in flight.
 *
 * `scan_at` is assigned in `start` and passed in. The action does not mint it.
 */
export const observe = workflow
  .define({
    args: { scan_at: v.string() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    const ref: ScanRef = await step.runAction(
      internal.meps2.orchestrate.observe.action.observe,
      { scan_at: args.scan_at },
      { retry: false, name: 'observe' },
    )
    await step.runMutation(internal.meps2.ingest.mutations.register, ref, {
      inline: true,
      name: 'register',
    })
    await step.runMutation(
      internal.meps2.orchestrate.drain.start.start,
      { path: ref.path },
      { inline: true, name: 'startDrain' },
    )
    return null
  })
