import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

/** The only transition out of an open job. Terminal jobs never change outcome. */
export async function finishJob(
  ctx: MutationCtx,
  jobId: Id<'jobs'>,
  outcome: NonNullable<Doc<'jobs'>['outcome']>,
) {
  const job = await ctx.db.get(jobId)

  if (job && job.finishedAt === undefined) {
    await ctx.db.patch(jobId, { finishedAt: Date.now(), outcome })
  }
}

/** Admission ends here; this does not cancel or otherwise touch existing jobs. */
export async function invalidateWebhook(ctx: MutationCtx, webhookId: Id<'webhooks'>) {
  const webhook = await ctx.db.get(webhookId)

  if (webhook && webhook.invalidatedAt === undefined) {
    await ctx.db.patch(webhookId, { invalidatedAt: Date.now() })
    // Log the transition once, not every later submission or cancelled job.
    // IDs allow inspection without exposing webhook URLs or credentials.
    console.warn('Discord webhook invalidated', { webhookId })
  }
}
