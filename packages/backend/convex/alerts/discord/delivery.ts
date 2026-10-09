import { ConvexError, v } from 'convex/values'

import { components } from '#generated/api'
import type { Id } from '#generated/dataModel'
import { env, internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../events/table'
import { INGESTIONS_TABLE, PROCESSOR_WORK_TABLE } from '../../ingestion/table'
import { renderEvents, renderRows } from './render'

const ALERT_MAX_AGE_MS = 60 * 60 * 1000

/** Commit sender jobs with the ingestion's events and processor completion. */
export async function sendIngestionAlerts(
  ctx: MutationCtx,
  input: { scan_at: string; event_ids: Id<'v4_events'>[] },
): Promise<void> {
  if (env.ORCA_DISCORD_AUTO_SEND_ENABLED !== 'true' || input.event_ids.length === 0) {
    return
  }

  // Initial routing policy: every registered webhook receives the regular alerts.
  // Zero destinations is valid. Subscription management can replace this selection
  // later without making routing or preparation into another durable work queue.
  const webhooks = await ctx.runQuery(components.discordSender.api.listWebhooks, {})

  if (webhooks.length === 0) {
    return
  }

  const rendered = await renderEvents(ctx, input.event_ids)

  if (rendered.messages.length === 0) {
    return
  }

  // Failures roll back the whole event commit, including earlier recipients.
  // Historical backfills keep their source-time deadline and expire in the sender.
  await submitToWebhooks(ctx, {
    webhookIds: webhooks.map((webhook) => webhook._id),
    messages: rendered.messages,
    key: `ingestion:${input.scan_at}`,
    expiresAt: Date.parse(input.scan_at) + ALERT_MAX_AGE_MS,
  })
}

/** Explicit operator send: rerender one completed ingestion with a fresh delivery window. */
export const sendIngestion = internalMutation({
  args: { ingestion_id: v.id(INGESTIONS_TABLE) },
  returns: v.object({ jobIds: v.array(v.string()), messageCount: v.number() }),
  handler: async (ctx, { ingestion_id }) => {
    const ingestion = await ctx.db.get(INGESTIONS_TABLE, ingestion_id)

    if (ingestion === null) {
      throw new ConvexError('Ingestion not found')
    }

    const work = await ctx.db
      .query(PROCESSOR_WORK_TABLE)
      .withIndex('by_ingestion_id_and_processor', (q) =>
        q.eq('ingestion_id', ingestion_id).eq('processor', 'events'),
      )
      .unique()

    if (work?.state !== 'complete') {
      throw new ConvexError('Ingestion event processing must be complete before sending alerts')
    }

    const webhooks = await ctx.runQuery(components.discordSender.api.listWebhooks, {})

    if (webhooks.length === 0) {
      return { jobIds: [], messageCount: 0 }
    }

    // Read the complete observation: filtering and batching must not depend on a
    // caller-selected event subset. Original observation times remain in the cards.
    const rows = await ctx.db
      .query(EVENTS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', ingestion.scan_at))
      .collect()
    const rendered = await renderRows(ctx, rows)

    // Each invocation is an intentional new send, even if this ingestion was sent
    // already. Convex keeps Math.random stable across transaction retries. No old
    // job, receipt, event or processor work is changed to make repetition possible.
    const run = `${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`
    const jobIds = await submitToWebhooks(ctx, {
      webhookIds: webhooks.map((webhook) => webhook._id),
      messages: rendered.messages,
      key: `manual-ingestion:${ingestion.scan_at}:${run}`,
      expiresAt: Date.now() + ALERT_MAX_AGE_MS,
    })

    return { jobIds, messageCount: rendered.messages.length }
  },
})

async function submitToWebhooks(
  ctx: MutationCtx,
  input: {
    webhookIds: string[]
    messages: { key: string; payload: string }[]
    key: string
    expiresAt: number
  },
): Promise<string[]> {
  if (input.messages.length === 0) {
    return []
  }

  const messages = input.messages.map(({ key, payload }) => ({ key, payload }))
  const jobIds: string[] = []

  for (const webhookId of input.webhookIds) {
    const jobId = await ctx.runMutation(components.discordSender.api.submitBatch, {
      key: `${input.key}:${webhookId}`,
      webhookId,
      expiresAt: input.expiresAt,
      messages,
    })
    jobIds.push(jobId)
  }

  return jobIds
}
