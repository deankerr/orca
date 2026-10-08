import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { MutationCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
import { pool } from './pool'

export async function scheduleDrain(ctx: MutationCtx, runAt: number): Promise<void> {
  let sender = await ctx.db.query('sender').unique()

  if (!sender) {
    const id = await ctx.db.insert('sender', { globalAvailableAt: 0, webhookAvailableAt: {} })
    sender = await ctx.db.get(id)
  }

  if (!sender) {
    throw new Error('Sender state was not initialized')
  }

  // Submission and putting down waiting work both come here. Keep the earliest
  // wake atomically, so a late checkpoint cannot postpone a newly submitted job.
  // This avoids one sleeping action (or one future action per submission).
  if (sender.wakeAt !== undefined && sender.wakeAt <= runAt) {
    return
  }

  if (sender.wakeId !== undefined) {
    await ctx.scheduler.cancel(sender.wakeId)
  }

  const wakeId = await ctx.scheduler.runAt(runAt, internal.scheduling.wake, {})
  await ctx.db.patch(sender._id, { wakeAt: runAt, wakeId })
}

export const schedule = internalMutation({
  args: { runAt: v.number() },
  handler: async (ctx, { runAt }) => {
    await scheduleDrain(ctx, runAt)
    return null
  },
  returns: v.null(),
})

export const wake = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sender = await ctx.db.query('sender').unique()

    if (!sender) {
      return null
    }

    // Clear the timer and enqueue in one transaction. A new submission during the
    // action can schedule another wake; Workpool serializes the actions. No running
    // flag or action completion callback participates in job state.
    await ctx.db.patch(sender._id, { wakeAt: undefined, wakeId: undefined })
    await pool.enqueueAction(ctx, internal.worker.drain, {})
    return null
  },
  returns: v.null(),
})
