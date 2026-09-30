import { ConvexError, v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalMutation } from '../_generated/server'
import { V4_EVENTS_TABLE } from './events/table'
import { V4_PROCESSOR_WORK_TABLE } from './ingestion/table'
import { assertScanPair } from './scan/time'

/** One-off compatibility cleanup; run between ingestions after legacy Listings work has drained. */
export const stripLegacyWork = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.object({ done: v.boolean(), removed: v.number(), stripped: v.number() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query(V4_PROCESSOR_WORK_TABLE)
      .withIndex('by_creation_time')
      .paginate({ cursor: cursor ?? null, numItems: 100, maximumBytesRead: 1_000_000 })

    let removed = 0
    let stripped = 0

    for (const work of page.page) {
      if (work.processor === 'listings') {
        if (work.state !== 'complete') {
          throw new ConvexError({
            message: 'Resolve legacy Listings work before cleanup',
            work_id: work._id,
          })
        }

        await ctx.db.delete(V4_PROCESSOR_WORK_TABLE, work._id)
        removed += 1
      } else if (work.previously_known_models !== undefined) {
        await ctx.db.patch(V4_PROCESSOR_WORK_TABLE, work._id, {
          previously_known_models: undefined,
        })

        stripped += 1
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.v4.cleanup.stripLegacyWork, {
        cursor: page.continueCursor,
      })
    }

    const result = { done: page.isDone, removed, stripped }
    console.log('[v4:cleanup] legacy work batch', result)
    return result
  },
})

/** Permanently delete Events and only their work in [from_scan_at, to_scan_at), preserving ingestions. */
export const deleteEvents = internalMutation({
  args: { from_scan_at: v.string(), to_scan_at: v.string() },
  returns: v.object({ done: v.boolean(), events: v.number(), work: v.number() }),
  handler: async (ctx, args) => {
    assertScanPair(args.from_scan_at, args.to_scan_at)

    // Event documents can approach 1 MiB; small batches leave transaction headroom without a new index.
    // Operator precondition: no ingestion, retry, regeneration, or broadcast may touch this range.
    const events = await ctx.db
      .query(V4_EVENTS_TABLE)
      .withIndex('by_scan_at', (q) =>
        q.gte('scan_at', args.from_scan_at).lt('scan_at', args.to_scan_at),
      )
      .take(8)

    for (const event of events) {
      await ctx.db.delete(V4_EVENTS_TABLE, event._id)
    }

    let workCount = 0

    // Drain event rows first; the final phase also removes jobs that produced no events.
    if (events.length === 0) {
      for (const state of ['pending', 'complete'] as const) {
        const work = await ctx.db
          .query(V4_PROCESSOR_WORK_TABLE)
          .withIndex('by_processor_and_state_and_scan_at', (q) =>
            q
              .eq('processor', 'events')
              .eq('state', state)
              .gte('scan_at', args.from_scan_at)
              .lt('scan_at', args.to_scan_at),
          )
          .take(4)

        for (const row of work) {
          await ctx.db.delete(V4_PROCESSOR_WORK_TABLE, row._id)
          workCount += 1
        }
      }
    }

    const done = events.length === 0 && workCount === 0

    if (!done) {
      await ctx.scheduler.runAfter(0, internal.v4.cleanup.deleteEvents, args)
    }

    const result = { done, events: events.length, work: workCount }
    console.log('[v4:cleanup] event range batch', { ...args, ...result })
    return result
  },
})
