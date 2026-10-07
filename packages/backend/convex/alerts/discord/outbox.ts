import {
  attemptView,
  destination,
  groupView,
  listAttemptsArgs,
  listGroupsArgs,
  listMessagesArgs,
  messageView,
  result,
} from '@orca/discord-delivery/validators'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import type { PaginationResult } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { components } from '#generated/api'
import { internalMutation, internalQuery } from '#generated/server'

/** Internal operator access to the exact archive, independent of current ORCA templates. */
export const groups = internalQuery({
  args: listGroupsArgs,
  returns: v.array(groupView),
  handler: async (ctx, args): Promise<Infer<typeof groupView>[]> =>
    await ctx.runQuery(components.discordDelivery.api.listGroups, args),
})
export const group = internalQuery({
  args: { groupId: v.string() },
  returns: v.union(groupView, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof groupView> | null> =>
    await ctx.runQuery(components.discordDelivery.api.getGroup, args),
})
export const messages = internalQuery({
  args: { ...listMessagesArgs, groupId: v.optional(v.string()) },
  returns: v.array(messageView),
  handler: async (ctx, args): Promise<Infer<typeof messageView>[]> =>
    await ctx.runQuery(components.discordDelivery.api.listMessages, args),
})
export const message = internalQuery({
  args: { messageId: v.string() },
  returns: v.union(messageView, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof messageView> | null> =>
    await ctx.runQuery(components.discordDelivery.api.getMessage, args),
})
/** from/to use actual attempt time; group from/to instead use caller-supplied sendAt. */
export const attempts = internalQuery({
  args: { ...listAttemptsArgs, messageId: v.optional(v.string()) },
  returns: v.array(attemptView),
  handler: async (ctx, args): Promise<Infer<typeof attemptView>[]> =>
    await ctx.runQuery(components.discordDelivery.api.listAttempts, args),
})
export const destinations = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(destination),
  handler: async (ctx, args): Promise<Infer<typeof destination>[]> =>
    await ctx.runQuery(components.discordDelivery.api.listDestinations, args),
})

/** Generic operator entry point for admin status, news, experiments, or other composed groups. */
export const enqueue = internalMutation({
  args: {
    destinationKey: v.string(),
    key: v.string(),
    sendAt: v.optional(v.number()),
    messages: v.array(v.object({ key: v.string(), payload: v.string() })),
    maxAgeMs: v.optional(v.number()),
    maxAttempts: v.optional(v.number()),
    reference: v.optional(v.string()),
    deadLetterDestinationKey: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> =>
    await ctx.runMutation(components.discordDelivery.api.enqueue, {
      ...args,
      sendAt: args.sendAt ?? Date.now(),
    }),
})
export const manage = internalMutation({
  args: {
    messageId: v.string(),
    operation: v.union(v.literal('get'), v.literal('edit'), v.literal('delete')),
    key: v.string(),
    sendAt: v.optional(v.number()),
    payload: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> =>
    await ctx.runMutation(components.discordDelivery.api.manageMessage, {
      ...args,
      sendAt: args.sendAt ?? Date.now(),
    }),
})
export const pause = internalMutation({
  args: { paused: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.discordDelivery.api.setPaused, args),
})

/** Paginated history avoids silently omitting deliveries during a busy incident window. */
export const inspectGroups = internalQuery({
  args: {
    ...v.object(listGroupsArgs).omit('limit').fields,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(groupView),
  handler: async (ctx, args): Promise<PaginationResult<Infer<typeof groupView>>> =>
    await ctx.runQuery(components.discordDelivery.history.groups, args),
})
export const inspectMessages = internalQuery({
  args: {
    ...v.object(listMessagesArgs).omit('limit').fields,
    groupId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(messageView),
  handler: async (ctx, args): Promise<PaginationResult<Infer<typeof messageView>>> =>
    await ctx.runQuery(components.discordDelivery.history.messages, args),
})
export const inspectAttempts = internalQuery({
  args: {
    ...v.object(listAttemptsArgs).omit('limit').fields,
    messageId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(attemptView),
  handler: async (ctx, args): Promise<PaginationResult<Infer<typeof attemptView>>> =>
    await ctx.runQuery(components.discordDelivery.history.attempts, args),
})

/** Search confirmed response/completion time, independent of scan time and queue waiting. */
export const inspectReceipts = internalQuery({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(result),
  handler: async (ctx, args): Promise<PaginationResult<Infer<typeof result>>> =>
    await ctx.runQuery(components.discordDelivery.history.results, args),
})
