import { vResultValidator, vWorkflowId } from '@convex-dev/workflow'
import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { internalMutation } from '../../../_generated/server'
import { workflow } from '../manager'
import { lockKey } from './workflow'

/**
 * Log, release the drain lock, cleanup the journal on success.
 * Re-arm latest-edge drain if a neighbor remains.
 */
export const onComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ path: v.string() }),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const payload = {
      workflowId: args.workflowId,
      path: args.context.path,
      result: args.result,
    }

    if (args.result.kind === 'failed') {
      console.error('[meps2:drain]', payload)
    } else {
      console.log('[meps2:drain]', payload)
    }

    await ctx.runMutation(internal.meps2.lock.release, {
      key: lockKey(args.context.path),
    })

    if (args.result.kind === 'success') {
      await workflow.cleanup(ctx, args.workflowId)

      await ctx.runMutation(internal.meps2.orchestrate.drain.start.start, {
        path: args.context.path,
      })
    }

    return null
  },
})
