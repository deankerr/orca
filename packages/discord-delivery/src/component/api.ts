import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import {
  selectGroups,
  selectMessages,
  selectAttempts,
  viewMessage,
  viewAttempt,
} from './inspection'
import { required, enqueueGroup, boundedLimit, getTask, ensureControl, wake } from './queue'
import {
  destination,
  groupView,
  messageView,
  attemptView,
  listGroupsArgs,
  listMessagesArgs,
  listAttemptsArgs,
} from './validators'

export const registerDestination = mutation({
  args: { key: v.string(), name: v.optional(v.string()), url: v.string() },
  handler: async (ctx, args) => {
    const url = new URL(args.url)
    if (
      args.key === undefined ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    ) {
      throw new Error('A destination needs a key and HTTP(S) URL without credentials or fragment')
    }
    const existing = await ctx.db
      .query('destinations')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, disabledReason: undefined })
      return existing._id
    }
    return await ctx.db.insert('destinations', args)
  },
  returns: v.id('destinations'),
})
export const listDestinations = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) =>
    await ctx.db.query('destinations').withIndex('by_key').take(boundedLimit(args.limit)),
  returns: v.array(destination),
})
export const enqueue = mutation({
  args: {
    deadLetterDestinationKey: v.optional(v.string()),
    destinationKey: v.string(),
    key: v.string(),
    maxAgeMs: v.optional(v.number()),
    maxAttempts: v.optional(v.number()),
    messages: v.array(v.object({ key: v.string(), payload: v.string() })),
    reference: v.optional(v.string()),
    sendAt: v.number(),
  },
  handler: async (ctx, args) =>
    await enqueueGroup(ctx, {
      ...args,
      messages: args.messages.map((message) => ({ ...message, operation: 'send' as const })),
    }),
  returns: v.id('groups'),
})
export const setPaused = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, args) => {
    const control = await ensureControl(ctx)
    await ctx.db.patch(control._id, { paused: args.paused })
    await wake(ctx)
    return null
  },
  returns: v.null(),
})
export const manageMessage = mutation({
  args: {
    key: v.string(),
    messageId: v.id('messages'),
    operation: v.union(v.literal('get'), v.literal('edit'), v.literal('delete')),
    payload: v.optional(v.string()),
    sendAt: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message || message.operation !== 'send') {
      throw new Error('Manage an original sent message')
    }
    const group = required(await ctx.db.get(message.groupId))
    const attemptResults = await ctx.db
      .query('results')
      .withIndex('by_message', (q) => q.eq('messageId', message._id))
      .order('desc')
      .take(100)
    const receipt = attemptResults.find(
      (result) =>
        result.response.status !== null &&
        result.response.status >= 200 &&
        result.response.status < 300 &&
        result.response.messageId !== undefined,
    )
    if (receipt?.response.messageId === undefined) {
      throw new Error('No confirmed Discord message receipt')
    }
    if (args.operation === 'edit' && args.payload === undefined) {
      throw new Error('Edit requires a payload')
    }
    if (args.operation !== 'edit' && args.payload !== undefined) {
      throw new Error('Only edit accepts a payload')
    }
    const url = new URL(group.url)
    const payload: unknown = JSON.parse(required(message.payload))
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'thread_name' in payload &&
      !url.searchParams.has('thread_id')
    ) {
      if (receipt.response.channelId === undefined || receipt.response.channelId === '') {
        throw new Error('No confirmed Discord thread receipt')
      }
      // Creating a forum/media thread routes the message to the returned channel.
      url.searchParams.set('thread_id', receipt.response.channelId)
    }
    return await enqueueGroup(ctx, {
      destinationKey: group.destinationKey,
      key: args.key,
      messages: [
        {
          key: message.key,
          operation: args.operation,
          payload: args.payload,
          remoteMessageId: receipt.response.messageId,
          sourceMessageId: message._id,
        },
      ],
      reference: `message:${message._id}`,
      sendAt: args.sendAt,
      urlOverride: url.toString(),
    })
  },
  returns: v.id('groups'),
})
export const getGroup = query({
  args: { groupId: v.id('groups') },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    return group ? { group, task: await getTask(ctx, group._id) } : null
  },
  returns: v.union(groupView, v.null()),
})
export const listGroups = query({
  args: listGroupsArgs,
  handler: async (ctx, args) => {
    const limit = boundedLimit(args.limit)
    const groups = await selectGroups(ctx.db, args).order('desc').take(500)
    const views = await Promise.all(
      groups.map(async (group) => ({ group, task: await getTask(ctx, group._id) })),
    )
    return views
      .filter((view) => args.status === undefined || view.task.status === args.status)
      .slice(0, limit)
  },
  returns: v.array(groupView),
})
export const getMessage = query({
  args: { messageId: v.id('messages') },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    return message ? await viewMessage(ctx, message) : null
  },
  returns: v.union(messageView, v.null()),
})
export const listMessages = query({
  args: listMessagesArgs,
  handler: async (ctx, args) => {
    const limit = boundedLimit(args.limit)
    const messages = await selectMessages(ctx.db, args).take(limit)
    return await Promise.all(messages.map(async (message) => await viewMessage(ctx, message)))
  },
  returns: v.array(messageView),
})
export const listAttempts = query({
  args: listAttemptsArgs,
  handler: async (ctx, args) => {
    const limit = boundedLimit(args.limit)
    const attempts = await selectAttempts(ctx.db, args).order('desc').take(limit)
    return await Promise.all(attempts.map(async (attempt) => await viewAttempt(ctx, attempt)))
  },
  returns: v.array(attemptView),
})

export const getDestination = query({
  args: { key: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query('destinations')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique(),
  returns: v.union(destination, v.null()),
})
