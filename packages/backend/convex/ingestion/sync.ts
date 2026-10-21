import { v } from 'convex/values'

import { internal } from '#generated/api'
import { env, internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { scheduleQueue } from './queue'

/** Kickoff: start both workers; each reads its own intent and stops when idle. */
export const run = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await kickoff(ctx)
    return null
  },
})

/** Cron entry point; manual kickoff remains available while disabled. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_INGESTION_CRON_ENABLED === 'true') {
      await kickoff(ctx)
    }

    return null
  },
})

/** Redundant kickoffs are harmless: overtaken register steps commit nothing. */
export async function kickoff(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(0, internal.ingestion.register.run, {})
  await scheduleQueue(ctx)
}
