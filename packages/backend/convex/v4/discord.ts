import { ConvexError, v } from 'convex/values'
import { ComponentType } from 'discord-api-types/v10'

import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { env, internalAction } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import { renderDiscord } from './eventRenderers/discord'

/** Operator-only, single-attempt delivery. Repeating the call posts the event again. */
export const send = internalAction({
  args: { event_id: v.id('v4_events') },
  returns: v.union(v.literal('sent'), v.literal('skipped')),
  handler: async (ctx, { event_id }) => await sendEvent(ctx, event_id),
})

const batchArgs = { event_ids: v.array(v.id('v4_events')) }
const batchCounts = v.object({ sent: v.number(), skipped: v.number() })

/** Operator replay; explicitly sending examples bypasses the live-preview switch. */
export const sendExamples = internalAction({
  args: batchArgs,
  returns: batchCounts,
  handler: async (ctx, { event_ids }) => await sendBatch(ctx, event_ids),
})

/** Pre-alpha, one attempt per scan: no delivery ledger, retries, or cross-batch ordering. */
export const broadcast = internalAction({
  args: batchArgs,
  returns: batchCounts,
  handler: async (ctx, { event_ids }) => {
    if (env.ORCA_DISCORD_PREVIEW_ENABLED !== 'true') {
      return { sent: 0, skipped: 0 }
    }

    return await sendBatch(ctx, event_ids)
  },
})

async function sendBatch(ctx: ActionCtx, eventIds: Id<'v4_events'>[]) {
  const counts = { sent: 0, skipped: 0 }

  // ponytail: fixed pacing and stop-on-error for the preview; durable delivery is explicitly deferred.
  // A 429, render error, or action timeout abandons the remainder; later scans run independently.
  for (const [index, eventId] of eventIds.entries()) {
    if (index > 0) {
      // oxlint-disable-next-line promise/avoid-new -- Convex timers expose callbacks; this is fixed pacing for the pre-alpha preview.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000)
      })
    }

    const result = await sendEvent(ctx, eventId)
    counts[result] += 1
  }

  return counts
}

async function sendEvent(ctx: ActionCtx, event_id: Id<'v4_events'>): Promise<'sent' | 'skipped'> {
  const webhook = env.ORCA_DISCORD_WEBHOOK_URL

  if (webhook === undefined || webhook === '') {
    throw new ConvexError('Set ORCA_DISCORD_WEBHOOK_URL before sending Discord events.')
  }

  const event = await ctx.runQuery(internal.v4.events.query.get, { event_id })

  if (event === null) {
    throw new ConvexError({ message: 'Event not found.', event_id })
  }

  const message = renderDiscord(event, {
    publicUrl: env.ORCA_PUBLIC_URL,
    logoOrigin: env.ENTITY_LOGO_SERVICE_ORIGIN,
  })

  if (message === null) {
    return 'skipped'
  }

  const debug = `-# pre-alpha · event: ${event_id}`

  if (message.components === undefined) {
    message.content = debug
  } else {
    // Components V2 disables message content; keep this sibling outside the card in the same message.
    message.components.push({ type: ComponentType.TextDisplay, content: debug })
  }

  const url = new URL(webhook)
  url.searchParams.set('wait', 'true')

  if (message.components !== undefined) {
    url.searchParams.set('with_components', 'true')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })

  if (!response.ok) {
    throw new ConvexError({
      message: 'Discord webhook rejected the event.',
      status: response.status,
      event_id,
    })
  }

  return 'sent'
}
