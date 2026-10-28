import { v } from 'convex/values'

import { components } from '#generated/api'
import { env, internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { INGESTION_RECORDS_TABLE } from '../../ingestion/tables'
import { renderRecord } from './render'

const ALERT_MAX_AGE_MS = 60 * 60 * 1000

/** Sender topic for ingestion alerts; eligible webhooks subscribe to it. */
export const ALERTS_TOPIC = 'ingestion'

/** Scheduled after ingestion completion; preparation failures leave source events intact. */
export const sendRecordAlerts = internalMutation({
  args: { record_id: v.id(INGESTION_RECORDS_TABLE) },
  handler: async (ctx, { record_id }) => {
    if (env.ORCA_DISCORD_AUTO_SEND_ENABLED !== 'true') {
      return null
    }

    const record = await ctx.db.get(INGESTION_RECORDS_TABLE, record_id)

    if (
      record === null ||
      !record.alerts ||
      Date.parse(record.scan_at) + ALERT_MAX_AGE_MS <= Date.now()
    ) {
      return null
    }

    const rendered = await renderRecord(ctx, record_id)

    // Rendering and fan-out share this alert transaction, independently of the
    // completed record. Delayed records retain their original source-time deadline.
    await submitAlerts(ctx, {
      expiresAt: Date.parse(rendered.scan_at) + ALERT_MAX_AGE_MS,
      key: `ingestion:${rendered.scan_at}`,
      messages: rendered.messages,
    })

    return null
  },
  returns: v.null(),
})

/** Read-only operator preview: current cards and filtering, without sender admission. */
export const prepareRecord = internalQuery({
  args: { record_id: v.id(INGESTION_RECORDS_TABLE) },
  handler: async (ctx, { record_id }) => await renderRecord(ctx, record_id),
  returns: v.object({
    messages: v.array(
      v.object({ key: v.string(), payload: v.string(), source_ids: v.array(v.string()) }),
    ),
    scan_at: v.string(),
    skippedEvents: v.array(
      v.object({
        reason: v.union(v.literal('ineligible'), v.literal('frequent_pricing'), v.literal('muted')),
        source_id: v.string(),
      }),
    ),
  }),
})

/** Explicit operator send: rerender one completed record with a fresh delivery window. */
export const sendRecord = internalMutation({
  args: { record_id: v.id(INGESTION_RECORDS_TABLE) },
  handler: async (ctx, { record_id }) => {
    const rendered = await renderRecord(ctx, record_id)

    // Each invocation is an intentional new send, even if this record was sent
    // already. Convex keeps Math.random stable across transaction retries. No old
    // job, receipt, event or processor work is changed to make repetition possible.
    const run = `${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`

    const jobIds = await submitAlerts(ctx, {
      expiresAt: Date.now() + ALERT_MAX_AGE_MS,
      key: `manual-ingestion:${rendered.scan_at}:${run}`,
      messages: rendered.messages,
    })

    return { jobIds, messageCount: rendered.messages.length }
  },
  returns: v.object({ jobIds: v.array(v.string()), messageCount: v.number() }),
})

async function submitAlerts(
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
    messages: input.messages.map(({ key, payload }) => ({ key, payload })),
    topic: ALERTS_TOPIC,
  })

  return jobs.map(({ jobId }) => jobId)
}
