import { ConvexError, v } from 'convex/values'
import { z } from 'zod'

import { internalMutation } from '../../../_generated/server'
import { jobFields, readJobContent } from '../entityChange'

/** Source times identify a comparison; replay must follow the same continuous observation chain. */
export const begin = internalMutation({
  args: { from_scan_at: v.string(), scan_at: v.string() },
  returns: v.id('ces_batches'),
  handler: async (ctx, args) => {
    z.iso.datetime().parse(args.from_scan_at)
    z.iso.datetime().parse(args.scan_at)
    if (args.from_scan_at >= args.scan_at) {
      throw new ConvexError('CES observation time must advance')
    }
    const existing = await ctx.db
      .query('ces_batches')
      .withIndex('by_scan_at', (q) => q.eq('scan_at', args.scan_at))
      .unique()
    if (existing !== null) {
      if (existing.from_scan_at !== args.from_scan_at) {
        throw new ConvexError('CES source pair changed; reset before replaying')
      }
      return existing._id
    }
    const latest = await ctx.db.query('ces_batches').withIndex('by_scan_at').order('desc').first()
    if (latest !== null && (!latest.complete || latest.scan_at !== args.from_scan_at)) {
      throw new ConvexError('Resume the latest CES batch or reset before replaying another range')
    }
    return await ctx.db.insert('ces_batches', { ...args, complete: false })
  },
})

/** Retry by logical identity, independent of traversal order. Changed extraction requires a reset. */
export const append = internalMutation({
  args: { batch_id: v.id('ces_batches'), jobs: v.array(jobFields) },
  returns: v.null(),
  handler: async (ctx, { batch_id, jobs }) => {
    const batch = await ctx.db.get('ces_batches', batch_id)
    if (batch === null || jobs.length > 20) {
      throw new ConvexError('Invalid CES ingestion batch')
    }
    for (const job of jobs) {
      if (job.from_scan_at !== batch.from_scan_at || job.scan_at !== batch.scan_at) {
        throw new ConvexError('CES job sources do not match its batch')
      }
      if (new TextEncoder().encode(job.content).length > 256_000) {
        throw new ConvexError('CES job exceeds 256 KB; refine chunking before accepting it')
      }
      readJobContent(job.content)
      const existing = await ctx.db
        .query('ces_jobs')
        .withIndex('by_scan_at_and_collection_and_entity_id_and_category', (q) =>
          q
            .eq('scan_at', job.scan_at)
            .eq('collection', job.collection)
            .eq('entity_id', job.entity_id)
            .eq('category', job.category),
        )
        .unique()
      if (existing === null) {
        if (batch.complete) {
          throw new ConvexError('Cannot add jobs to a completed CES batch')
        }
        await ctx.db.insert('ces_jobs', { ...job, complete: false })
      } else if (existing.from_scan_at !== job.from_scan_at || existing.content !== job.content) {
        throw new ConvexError(
          'CES retry changed an accepted job; reset before changing ingestion rules',
        )
      }
    }
    return null
  },
})

/** Called only after every append succeeds; this receipt exposes the whole comparison to processing. */
export const complete = internalMutation({
  args: { batch_id: v.id('ces_batches') },
  returns: v.null(),
  handler: async (ctx, { batch_id }) => {
    await ctx.db.patch('ces_batches', batch_id, { complete: true })
    return null
  },
})
