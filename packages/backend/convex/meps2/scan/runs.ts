import { ConvexError, v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import { runStats } from '../tables/runs'

// a running row older than this is assumed dead, failed, and taken over
const STALE_RUNNING_MS = 30 * 60 * 1000

export const runStart = internalMutation({
  args: { workflow: v.string(), timestamp: v.number() },
  handler: async (ctx, args) => {
    // refuse to start while an active run exists, but take over runs left by a crashed action
    for await (const run of ctx.db
      .query('meps2_runs')
      .withIndex('by_workflow_status', (q) =>
        q.eq('workflow', args.workflow).eq('status', 'running'),
      )) {
      if (args.timestamp - run.started_at < STALE_RUNNING_MS) {
        throw new ConvexError({
          message: 'run already in progress',
          workflow: args.workflow,
          run_id: run._id,
        })
      }

      await ctx.db.patch(run._id, {
        status: 'failed',
        completed_at: args.timestamp,
        error: 'stale run taken over',
      })
    }

    return await ctx.db.insert('meps2_runs', {
      workflow: args.workflow,
      status: 'running',
      started_at: args.timestamp,
    })
  },
})

export const runComplete = internalMutation({
  args: { run_id: v.id('meps2_runs'), completed_at: v.number(), stats: v.optional(runStats) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      status: 'succeeded',
      completed_at: args.completed_at,
      stats: args.stats,
    })
  },
})

export const runFail = internalMutation({
  args: { run_id: v.id('meps2_runs'), completed_at: v.number(), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.run_id, {
      status: 'failed',
      completed_at: args.completed_at,
      error: args.error,
    })
  },
})

export const dev_wipeRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    for await (const doc of ctx.db.query('meps2_runs')) {
      await ctx.db.delete('meps2_runs', doc._id)
    }
  },
})
