import { paginator } from 'convex-helpers/server/pagination'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import {
  selectGroups,
  selectMessages,
  selectAttempts,
  viewMessage,
  viewAttempt,
} from './inspection'
import { getTask, boundedLimit } from './queue'
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
  args: {
    ...v.object(listGroupsArgs).omit('limit').fields,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    const db = paginator(ctx.db, schema)
    const base = selectGroups(db, args)
    const { page, continueCursor, isDone } = await base.order('desc').paginate(args.paginationOpts)
    const views = await Promise.all(
      page.map(async (group) => ({ group, task: await getTask(ctx, group._id) })),
    )
    return {
      continueCursor,
      isDone,
      page: views.filter((view) => args.status === undefined || view.task.status === args.status),
    }
  },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), page: v.array(groupView) }),
})
export const attempts = query({
  args: {
    ...v.object(listAttemptsArgs).omit('limit').fields,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    const db = paginator(ctx.db, schema)
    const base = selectAttempts(db, args)
    const { page, continueCursor, isDone } = await base.order('desc').paginate(args.paginationOpts)
    return {
      continueCursor,
      isDone,
      page: await Promise.all(page.map(async (attempt) => await viewAttempt(ctx, attempt))),
    }
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    page: v.array(attemptView),
  }),
})
export const messages = query({
  args: {
    ...v.object(listMessagesArgs).omit('limit').fields,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    boundedLimit(args.paginationOpts.numItems)
    const base = selectMessages(paginator(ctx.db, schema), args)
    const { page, continueCursor, isDone } = await base.paginate(args.paginationOpts)
    return {
      continueCursor,
      isDone,
      page: await Promise.all(page.map(async (message) => await viewMessage(ctx, message))),
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
