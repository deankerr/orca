import { v } from 'convex/values'

import { components } from '#generated/api'
import { env, internalMutation, internalQuery } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { SCAN_REGISTRATIONS_TABLE } from '../../ingestion/tables'
import { renderRegistration } from './render'

const ALERT_MAX_AGE_MS = 60 * 60 * 1000

/** Scheduled after ingestion completion; preparation failures leave source events intact. */
export const sendRegistrationAlerts = internalMutation({
  args: { registration_id: v.id(SCAN_REGISTRATIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { registration_id }) => {
    if (env.ORCA_DISCORD_AUTO_SEND_ENABLED !== 'true') {
      return null
    }

    const registration = await ctx.db.get(SCAN_REGISTRATIONS_TABLE, registration_id)
    if (
      registration === null ||
      registration.from_scan_at === null ||
      Date.parse(registration.scan_at) + ALERT_MAX_AGE_MS <= Date.now()
    ) {
      return null
    }
    const rendered = await renderRegistration(ctx, registration_id)

    // Rendering and fan-out share this alert transaction, independently of the
    // completed registration. Backfills retain their original source-time deadline.
    await submitAlerts(ctx, {
      messages: rendered.messages,
      key: `ingestion:${rendered.scan_at}`,
      expiresAt: Date.parse(rendered.scan_at) + ALERT_MAX_AGE_MS,
    })
    return null
  },
})

/** Read-only operator preview: current cards and filtering, without sender admission. */
export const prepareRegistration = internalQuery({
  args: { registration_id: v.id(SCAN_REGISTRATIONS_TABLE) },
  returns: v.object({
    scan_at: v.string(),
    messages: v.array(
      v.object({ key: v.string(), payload: v.string(), source_ids: v.array(v.string()) }),
    ),
    skippedEvents: v.array(
      v.object({
        source_id: v.string(),
        reason: v.union(v.literal('ineligible'), v.literal('frequent_pricing')),
      }),
    ),
  }),
  handler: async (ctx, { registration_id }) => await renderRegistration(ctx, registration_id),
})

/** Explicit operator send: rerender one completed registration with a fresh delivery window. */
export const sendRegistration = internalMutation({
  args: { registration_id: v.id(SCAN_REGISTRATIONS_TABLE) },
  returns: v.object({ jobIds: v.array(v.string()), messageCount: v.number() }),
  handler: async (ctx, { registration_id }) => {
    const rendered = await renderRegistration(ctx, registration_id)

    // Each invocation is an intentional new send, even if this registration was sent
    // already. Convex keeps Math.random stable across transaction retries. No old
    // job, receipt, event or processor work is changed to make repetition possible.
    const run = `${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`
    const jobIds = await submitAlerts(ctx, {
      messages: rendered.messages,
      key: `manual-ingestion:${rendered.scan_at}:${run}`,
      expiresAt: Date.now() + ALERT_MAX_AGE_MS,
    })

    return { jobIds, messageCount: rendered.messages.length }
  },
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
    topic: 'ingestion',
    messages: input.messages.map(({ key, payload }) => ({ key, payload })),
  })

  return jobs.map(({ jobId }) => jobId)
}
