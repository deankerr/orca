import { v } from 'convex/values'

import { components } from '#generated/api'
import { env, internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../events/table'
import { INGESTIONS_TABLE } from '../../ingestion/table'
import { renderEvents, renderIngestion } from './render'

const ALERT_MAX_AGE_MS = 60 * 60 * 1000

/** Scheduled after event commit; preparation failures leave source events intact. */
export const sendIngestionAlerts = internalMutation({
  args: { scan_at: v.string(), event_ids: v.array(v.id(EVENTS_TABLE)) },
  returns: v.null(),
  handler: async (ctx, { scan_at, event_ids }) => {
    if (env.ORCA_DISCORD_AUTO_SEND_ENABLED !== 'true' || event_ids.length === 0) {
      return null
    }

    const rendered = await renderEvents(ctx, event_ids)

    // Rendering and fan-out share this alert transaction, independently of the
    // completed event work. Backfills retain their original source-time deadline.
    await submitIngestionAlerts(ctx, {
      messages: rendered.messages,
      key: `ingestion:${scan_at}`,
      expiresAt: Date.parse(scan_at) + ALERT_MAX_AGE_MS,
    })
    return null
  },
})

/** Read-only operator preview: current cards and filtering, without sender admission. */
export const prepareIngestion = internalQuery({
  args: { ingestion_id: v.id(INGESTIONS_TABLE) },
  returns: v.object({
    scan_at: v.string(),
    messages: v.array(
      v.object({ key: v.string(), payload: v.string(), event_ids: v.array(v.string()) }),
    ),
    skippedEvents: v.array(
      v.object({
        event_id: v.string(),
        reason: v.union(v.literal('ineligible'), v.literal('frequent_pricing')),
      }),
    ),
  }),
  handler: async (ctx, { ingestion_id }) => await renderIngestion(ctx, ingestion_id),
})

/** Explicit operator send: rerender one completed ingestion with a fresh delivery window. */
export const sendIngestion = internalMutation({
  args: { ingestion_id: v.id(INGESTIONS_TABLE) },
  returns: v.object({ jobIds: v.array(v.string()), messageCount: v.number() }),
  handler: async (ctx, { ingestion_id }) => {
    const rendered = await renderIngestion(ctx, ingestion_id)

    // Each invocation is an intentional new send, even if this ingestion was sent
    // already. Convex keeps Math.random stable across transaction retries. No old
    // job, receipt, event or processor work is changed to make repetition possible.
    const run = `${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`
    const jobIds = await submitIngestionAlerts(ctx, {
      messages: rendered.messages,
      key: `manual-ingestion:${rendered.scan_at}:${run}`,
      expiresAt: Date.now() + ALERT_MAX_AGE_MS,
    })

    return { jobIds, messageCount: rendered.messages.length }
  },
})

async function submitIngestionAlerts(
  ctx: MutationCtx,
  input: {
    messages: { key: string; payload: string }[]
    key: string
    expiresAt: number
  },
): Promise<string[]> {
  if (input.messages.length === 0) {
    return []
  }

  // Subscription matching and fan-out belong to the sender. The host supplies
  // one topic and one observation key, regardless of its current recipients.
  const jobs = await ctx.runMutation(components.discordSender.api.submitBatch, {
    ...input,
    topic: 'ingestion',
    messages: input.messages.map(({ key, payload }) => ({ key, payload })),
  })

  return jobs.map(({ jobId }) => jobId)
}
