import { ConvexError, v } from 'convex/values'

import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import { internalAction, internalMutation } from '../../../_generated/server'
import { process } from './rules'

const progress = v.object({ cursor: v.string(), done: v.boolean(), considered: v.number() })

/** A transient traversal cursor bounds one run; job completion is the only durable processing state. */
export const step = internalMutation({
  args: { cursor: v.union(v.null(), v.string()) },
  returns: progress,
  handler: async (ctx, { cursor }) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query('ces_jobs')
      .withIndex('by_complete', (q) => q.eq('complete', false))
      .paginate({ cursor, numItems: 20, maximumBytesRead: 2_000_000 })
    const accepted = new Map<string, boolean>()
    const jobs: Doc<'ces_jobs'>[] = []
    for (const job of page) {
      if (!accepted.has(job.scan_at)) {
        const batch = await ctx.db
          .query('ces_batches')
          .withIndex('by_scan_at', (q) => q.eq('scan_at', job.scan_at))
          .unique()
        if (batch === null) {
          throw new ConvexError('CES job has no ingestion batch')
        }
        accepted.set(job.scan_at, batch.complete)
      }
      if (accepted.get(job.scan_at) === true) {
        jobs.push(job)
      }
    }
    await process(ctx, jobs)
    return { cursor: continueCursor, done: isDone, considered: jobs.length }
  },
})

/** Visit unfinished work, including prior deferrals. Empty output is not a reason to stop traversal.
 * Overlapping runners and concurrent-arrival policy are deliberately deferred orchestration concerns.
 */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    let cursor: string | null = null
    let considered = 0
    while (true) {
      const result: { cursor: string; done: boolean; considered: number } = await ctx.runMutation(
        internal.v3.ces.processing.run.step,
        { cursor },
      )
      considered += result.considered
      if (result.done) {
        break
      }
      ;({ cursor } = result)
    }
    console.log('CES processing finished', { considered })
    return null
  },
})
