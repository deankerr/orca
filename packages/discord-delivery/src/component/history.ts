import { paginator } from 'convex-helpers/server/pagination'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { viewMessage } from './api'
import { required, getTask, boundedLimit } from './queue'
import schema from './schema'
import {
  result,
  groupView,
  attemptView,
  messageView,
  listGroupsArgs,
  listAttemptsArgs,
  listMessagesArgs,
} from './validators'

export const groups = query({
  args: { ...listGroupsArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    const db = paginator(ctx.db, schema)
    const select = () => {
      if (args.key !== undefined) {
        return db.query('groups').withIndex('by_key', (q) => q.eq('key', required(args.key)))
      }
      if (args.destinationKey !== undefined) {
        return db.query('groups').withIndex('by_destination_sendAt_key', (q) =>
          q
            .eq('destinationKey', required(args.destinationKey))
            .gte('sendAt', args.from ?? 0)
            .lte('sendAt', args.to ?? Number.MAX_SAFE_INTEGER),
        )
      }
      return db
        .query('groups')
        .withIndex('by_sendAt', (q) =>
          q.gte('sendAt', args.from ?? 0).lte('sendAt', args.to ?? Number.MAX_SAFE_INTEGER),
        )
    }
    const base = select()
    const { page, continueCursor, isDone } = await base.order('desc').paginate(args.paginationOpts)
    const views = await Promise.all(
      page.map(async (group) => ({ group, task: await getTask(ctx, group._id) })),
    )
    return {
      continueCursor,
      isDone,
      page: views.filter(
        (view) =>
          (!args.status || view.task.status === args.status) &&
          (args.destinationKey === undefined ||
            view.group.destinationKey === args.destinationKey) &&
          (args.from === undefined || view.group.sendAt >= args.from) &&
          (args.to === undefined || view.group.sendAt <= args.to),
      ),
    }
  },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), page: v.array(groupView) }),
})
export const attempts = query({
  args: { ...listAttemptsArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    const db = paginator(ctx.db, schema)
    const base =
      args.messageId === undefined
        ? db
            .query('attempts')
            .withIndex('by_startedAt', (q) =>
              q
                .gte('startedAt', args.from ?? 0)
                .lte('startedAt', args.to ?? Number.MAX_SAFE_INTEGER),
            )
        : db
            .query('attempts')
            .withIndex('by_message', (q) => q.eq('messageId', required(args.messageId)))
    const { page, continueCursor, isDone } = await base.order('desc').paginate(args.paginationOpts)
    return {
      continueCursor,
      isDone,
      page: await Promise.all(
        page
          .filter(
            (attempt) =>
              (args.from === undefined || attempt.startedAt >= args.from) &&
              (args.to === undefined || attempt.startedAt <= args.to),
          )
          .map(async (attempt) => ({
            attempt,
            result: await ctx.db
              .query('results')
              .withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
              .unique(),
          })),
      ),
    }
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    page: v.array(attemptView),
  }),
})
export const messages = query({
  args: { ...listMessagesArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    if (args.groupId === undefined && args.key === undefined) {
      throw new Error('Supply groupId or message key')
    }
    const db = paginator(ctx.db, schema)
    const base =
      args.groupId === undefined
        ? db.query('messages').withIndex('by_key', (q) => q.eq('key', required(args.key)))
        : db
            .query('messages')
            .withIndex('by_group_position', (q) => q.eq('groupId', required(args.groupId)))
    const { page, continueCursor, isDone } = await base.paginate(args.paginationOpts)
    return {
      continueCursor,
      isDone,
      page: await Promise.all(
        page
          .filter((message) => args.key === undefined || message.key === args.key)
          .map(async (message) => await viewMessage(ctx, message)),
      ),
    }
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    page: v.array(messageView),
  }),
})

/** Receipt time differs from claim time when scheduler or HTTP requests are delayed. */
export const results = query({
  args: {
    from: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    const { page, continueCursor, isDone } = await paginator(ctx.db, schema)
      .query('results')
      .withIndex('by_completedAt', (q) =>
        q.gte('completedAt', args.from ?? 0).lte('completedAt', args.to ?? Number.MAX_SAFE_INTEGER),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { continueCursor, isDone, page }
  },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), page: v.array(result) }),
})
