import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction, internalQuery } from './_generated/server'
import { required, getControl } from './queue'
import { operation } from './schema'
import { executeRequest } from './transport'

export const readRequest = internalQuery({
  args: { attemptId: v.id('attempts') },
  handler: async (ctx, args) => {
    const control = await getControl(ctx)
    if (control?.activeAttemptId !== args.attemptId) {
      return null
    }
    const attempt = required(await ctx.db.get(args.attemptId))
    const message = required(await ctx.db.get(attempt.messageId))
    const group = required(await ctx.db.get(attempt.groupId))
    if (group.expiresAt !== undefined && Date.now() >= group.expiresAt) {
      return { skipped: 'expired' as const }
    }
    if (control.paused) {
      return { skipped: 'paused' as const }
    }
    return {
      messageId: message.remoteMessageId,
      operation: message.operation,
      payload: message.payload,
      url: group.url,
    }
  },
  returns: v.union(
    v.null(),
    v.object({ skipped: v.union(v.literal('expired'), v.literal('paused')) }),
    v.object({
      messageId: v.optional(v.string()),
      operation,
      payload: v.optional(v.string()),
      url: v.string(),
    }),
  ),
})
export const execute = internalAction({
  args: { attemptId: v.id('attempts') },
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(internal.request.readRequest, args)
    if (!request) {
      return null
    }
    const response =
      'skipped' in request
        ? { body: '', headers: {}, skipped: request.skipped, status: null }
        : await executeRequest(request)
    await ctx.runMutation(internal.worker.recordResult, { ...args, response })
    return null
  },
  returns: v.null(),
})
