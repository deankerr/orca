import { vResultValidator, vWorkflowId } from '@convex-dev/workflow'
import { v } from 'convex/values'

import { internalMutation } from '../../../_generated/server'
import { release } from '../../../locks'
import { workflow } from '../manager'
import { LOCK_KEY } from './workflow'

/**
 * Log, release the observe lock, cleanup the journal on success.
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
      console.error('[meps2:observe]', payload)
    } else {
      console.log('[meps2:observe]', payload)
    }

    await release(ctx, LOCK_KEY)

    if (args.result.kind === 'success') {
      await workflow.cleanup(ctx, args.workflowId)
    }

    return null
  },
})
