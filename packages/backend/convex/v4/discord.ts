import { ConvexError, v } from 'convex/values'

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

/** Replay selected examples in order, pausing one second between requests. */
export const sendExamples = internalAction({
  args: { event_ids: v.array(v.id('v4_events')) },
  returns: v.object({ sent: v.number(), skipped: v.number() }),
  handler: async (ctx, { event_ids }) => {
    const counts = { sent: 0, skipped: 0 }

    for (const [index, event_id] of event_ids.entries()) {
      if (index > 0) {
        // oxlint-disable-next-line promise/avoid-new -- Convex timers expose callbacks; this is a fixed pause in a temporary operator action.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1000)
        })
      }

      const result = await sendEvent(ctx, event_id)
      counts[result] += 1
    }

    return counts
  },
})

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
    })
  }

  return 'sent'
}
