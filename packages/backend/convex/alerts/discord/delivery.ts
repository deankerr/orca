import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

import { components, internal } from '#generated/api'
import { internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../events/table'
import { automaticRoutes } from './admission'
import { renderEvents, renderedBatch, renderRows } from './render'
import {
  DISCORD_PREPARATIONS_TABLE,
  discordPreparationsTable,
  preparationState,
  skippedEvent,
} from './table'

const batchArgs = { event_ids: v.array(v.id('v4_events')) }
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
    key: string
    sendAt: number
    maxAgeMs?: number
    reference: string
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
        key: options.key,
        sendAt: options.sendAt,
        maxAgeMs: options.maxAgeMs,
        messages: rendered.messages.map(({ key, payload }) => ({ key, payload })),
        reference: options.reference,
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

const MAX_DEMO_EVENTS = 1000

/** Development iteration: rerender a complete scan and submit a fresh run through the normal queue. */
export const demoScan = internalMutation({
  args: { scan_at: v.string(), destinationKeys: v.array(v.string()) },
  returns: queuedBatch,
  handler: async (ctx, { scan_at, destinationKeys }) => {
    const scanAt = z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString())
      .parse(scan_at)
    const rows = await ctx.db
      .query(EVENTS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scanAt))
      .take(MAX_DEMO_EVENTS + 1)
    if (rows.length === 0) {
      throw new ConvexError('No events found for this scan_at on the selected deployment.')
    }
    if (rows.length > MAX_DEMO_EVENTS) {
      throw new ConvexError(
        `Demo scans support at most ${MAX_DEMO_EVENTS} events; refusing to send a partial scan.`,
      )
    }
    const rendered = await renderRows(ctx, rows)
    // Convex seeds Math.random per invocation and preserves it across transaction retries.
    const key = `demo:${scanAt}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`
    return await enqueueRendered(ctx, rendered, {
      destinationKeys,
      key,
      sendAt: Date.now(),
      reference: JSON.stringify({
        kind: 'demo-scan',
        scan_at: scanAt,
        messages: rendered.messages.map(({ key, event_ids }) => ({ key, event_ids })),
      }),
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
