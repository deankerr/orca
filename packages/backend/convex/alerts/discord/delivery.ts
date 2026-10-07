import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { components, internal } from '#generated/api'
import { internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { readPage } from '../shared/read'
import { automaticRoutes } from './admission'
import { renderEvents, renderedBatch, renderRows } from './render'
import {
  DISCORD_PREPARATIONS_TABLE,
  discordPreparationsTable,
  preparationState,
  skippedEvent,
} from './table'

const batchArgs = { event_ids: v.array(v.id('v4_events')) }
const enqueueOptions = {
  destinationKeys: v.array(v.string()),
  key: v.optional(v.string()),
  sendAt: v.optional(v.number()),
  maxAgeMs: v.optional(v.number()),
}
const queuedBatch = v.object({
  groupIds: v.array(v.string()),
  queued: v.number(),
  skipped: v.number(),
  skippedEvents: v.array(skippedEvent),
})

/** Today's rendering, without queuing or contacting Discord. Archived payloads live in the sender. */
export const preview = internalQuery({
  args: batchArgs,
  returns: renderedBatch,
  handler: async (ctx, { event_ids }) => await renderEvents(ctx, event_ids),
})

async function enqueueRendered(
  ctx: MutationCtx,
  rendered: Infer<typeof renderedBatch>,
  options: {
    destinationKeys: string[]
    key?: string
    sendAt: number
    maxAgeMs?: number
    reference?: string
  },
): Promise<Infer<typeof queuedBatch>> {
  const destinations = [...new Set(options.destinationKeys)]
  if (destinations.length === 0 || destinations.length > 20) {
    throw new ConvexError('Supply between 1 and 20 destinations.')
  }
  const groupIds: string[] = []
  if (rendered.messages.length > 0) {
    for (const destinationKey of destinations) {
      const groupId: string = await ctx.runMutation(components.discordDelivery.api.enqueue, {
        destinationKey,
        key: options.key ?? rendered.key,
        sendAt: options.sendAt,
        maxAgeMs: options.maxAgeMs,
        messages: rendered.messages.map(({ key, payload }) => ({ key, payload })),
        reference:
          options.reference ??
          JSON.stringify({
            kind: 'events',
            messages: rendered.messages.map(({ key, event_ids }) => ({ key, event_ids })),
          }),
      })
      groupIds.push(groupId)
    }
  }
  return {
    groupIds,
    queued: rendered.messages.length * destinations.length,
    skipped: rendered.skippedEvents.length,
    skippedEvents: rendered.skippedEvents,
  }
}

/** Operator replay uses current time unless explicitly given scan time and an expiry. */
export const sendExamples = internalMutation({
  args: { ...batchArgs, ...enqueueOptions },
  returns: queuedBatch,
  handler: async (ctx, args) =>
    await enqueueRendered(ctx, await renderEvents(ctx, args.event_ids), {
      ...args,
      sendAt: args.sendAt ?? Date.now(),
    }),
})

export const send = internalMutation({
  args: { event_id: v.id('v4_events'), ...enqueueOptions },
  returns: queuedBatch,
  handler: async (ctx, args) =>
    await enqueueRendered(ctx, await renderEvents(ctx, [args.event_id]), {
      ...args,
      sendAt: args.sendAt ?? Date.now(),
    }),
})

/** Bounded recent replay, oldest first; all delivery still goes through the shared queue. */
export const sendLatest = internalMutation({
  args: { limit: v.optional(v.number()), ...enqueueOptions },
  returns: queuedBatch,
  handler: async (ctx, { limit = 10, ...options }) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ConvexError('limit must be an integer between 1 and 50.')
    }
    const page = await readPage(ctx, { kind: 'all' }, { cursor: null, numItems: 500 })
    const selected = []
    for (const row of page.page) {
      const candidate = await renderRows(ctx, [row])
      if (candidate.messages.length > 0) {
        selected.push(row)
      }
      if (selected.length === limit) {
        break
      }
    }
    return await enqueueRendered(ctx, await renderRows(ctx, selected), {
      ...options,
      sendAt: options.sendAt ?? Date.now(),
    })
  },
})

/** The nested transaction rolls back every destination enqueue together on a preparation failure. */
export const prepare = internalMutation({
  args: { preparationId: v.id(DISCORD_PREPARATIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { preparationId }) => {
    const work = await ctx.db.get(DISCORD_PREPARATIONS_TABLE, preparationId)
    if (work === null || work.state === 'complete') {
      return null
    }
    try {
      await ctx.runMutation(internal.alerts.discord.delivery.commitPreparation, { preparationId })
    } catch (error) {
      await ctx.db.patch(DISCORD_PREPARATIONS_TABLE, preparationId, {
        state: 'failed',
        attempts: work.attempts + 1,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return null
  },
})

export const commitPreparation = internalMutation({
  args: { preparationId: v.id(DISCORD_PREPARATIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { preparationId }) => {
    const work = await ctx.db.get(DISCORD_PREPARATIONS_TABLE, preparationId)
    if (work === null || work.state === 'complete') {
      return null
    }
    if (work.routes.length === 0) {
      throw new ConvexError(
        'No automatic Discord destinations configured. Configure a route, then retry this preparation.',
      )
    }
    const rendered = await renderEvents(ctx, work.event_ids)
    const groupIds: string[] = []
    for (const route of work.routes) {
      const result = await enqueueRendered(ctx, rendered, {
        destinationKeys: [route.destinationKey],
        key: 'automatic-events',
        sendAt: Date.parse(work.scan_at),
        maxAgeMs: route.maxAgeMs,
        reference: JSON.stringify({
          kind: 'automatic-events',
          preparationId,
          scan_at: work.scan_at,
          messages: rendered.messages.map(({ key, event_ids }) => ({ key, event_ids })),
        }),
      })
      groupIds.push(...result.groupIds)
    }
    await ctx.db.patch(DISCORD_PREPARATIONS_TABLE, preparationId, {
      state: 'complete',
      attempts: work.attempts + 1,
      completedAt: Date.now(),
      groupIds,
      skippedEvents: rendered.skippedEvents,
      error: undefined,
    })
    return null
  },
})

/** Retries preserve captured routing; only a previously missing route set is filled in. */
export const retryPreparation = internalMutation({
  args: { preparationId: v.id(DISCORD_PREPARATIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { preparationId }) => {
    const work = await ctx.db.get(DISCORD_PREPARATIONS_TABLE, preparationId)
    if (work === null) {
      throw new ConvexError('Preparation not found.')
    }
    if (work.state === 'complete') {
      return null
    }
    await ctx.db.patch(DISCORD_PREPARATIONS_TABLE, preparationId, {
      state: 'pending',
      error: undefined,
      routes: work.routes.length === 0 ? await automaticRoutes(ctx) : work.routes,
    })
    await ctx.scheduler.runAfter(0, internal.alerts.discord.delivery.prepare, { preparationId })
    return null
  },
})

export const preparations = internalQuery({
  args: {
    state: v.optional(preparationState),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(docValidator(DISCORD_PREPARATIONS_TABLE, discordPreparationsTable)),
  handler: async (ctx, { state, from = '', to = '\uFFFF', limit = 100 }) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new ConvexError('limit must be between 1 and 500.')
    }
    const query = ctx.db.query(DISCORD_PREPARATIONS_TABLE)
    const range =
      state === undefined
        ? query.withIndex('by_scan_at', (q) => q.gte('scan_at', from).lt('scan_at', to))
        : query.withIndex('by_state_scan_at', (q) =>
            q.eq('state', state).gte('scan_at', from).lt('scan_at', to),
          )
    return await range.order('desc').take(limit)
  },
})
