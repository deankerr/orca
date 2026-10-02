import type { PaginationResult } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import { ComponentType } from 'discord-api-types/v10'

import { internal } from '../_generated/api'
import type { Doc, Id } from '../_generated/dataModel'
import { env, internalAction } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import { forDiscord } from './alerts/pipelines'
import { renderDiscordBatch } from './alerts/renderers/discord'
import type { Card } from './alerts/renderers/discord/card'
import { dot } from './alerts/renderers/discord/display'

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

/** Replay the latest renderable events, oldest first, without enabling live delivery. */
export const sendLatest = internalAction({
  args: { limit: v.optional(v.number()) },
  returns: batchCounts,
  handler: async (ctx, { limit = 10 }) => {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ConvexError('limit must be an integer between 1 and 50.')
    }

    const ids: Id<'v4_events'>[] = []
    let cursor: string | null = null
    let skipped = 0

    // ponytail: inspect at most 500 recent events; return fewer examples when
    // this window is mostly filtered. Historical replay can grow separately.
    for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
      const page: PaginationResult<Doc<'v4_events'>> = await ctx.runQuery(
        internal.v4.events.query.list,
        {
          paginationOpts: { cursor, numItems: 100 },
        },
      )

      for (const event of page.page) {
        const { alerts } = forDiscord([event])

        if (alerts.length === 0) {
          skipped += 1
        } else {
          ids.push(event._id)
        }

        if (ids.length === limit) {
          break
        }
      }

      if (ids.length === limit || page.isDone) {
        break
      }

      cursor = page.continueCursor
    }

    const counts = await sendBatch(ctx, ids.toReversed())

    return { sent: counts.sent, skipped: skipped + counts.skipped }
  },
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
  const rows: Doc<'v4_events'>[] = []

  for (const event_id of new Set(eventIds)) {
    const row = await ctx.runQuery(internal.v4.events.query.get, { event_id })

    if (row === null) {
      throw new ConvexError({ message: 'Event not found.', event_id })
    }

    rows.push({ ...row, _id: event_id })
  }

  const { alerts, skipped } = forDiscord(rows)
  const notifications = renderDiscordBatch(alerts, {
    publicUrl: env.ORCA_PUBLIC_URL,
    logoOrigin: env.ENTITY_LOGO_SERVICE_ORIGIN,
  })
  let sent = 0

  for (const { message, event_ids } of notifications) {
    if (sent > 0) {
      // oxlint-disable-next-line promise/avoid-new -- Convex timers expose callbacks; this is fixed pacing for the pre-alpha preview.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 2000)
      })
    }

    // ponytail: fixed pacing and stop-on-error; durable delivery remains deferred.
    await postMessage(message, event_ids)
    sent += 1
  }

  return { sent, skipped }
}

async function sendEvent(ctx: ActionCtx, event_id: Id<'v4_events'>): Promise<'sent' | 'skipped'> {
  const event = await ctx.runQuery(internal.v4.events.query.get, { event_id })

  if (event === null) {
    throw new ConvexError({ message: 'Event not found.', event_id })
  }

  const { alerts } = forDiscord([{ ...event, _id: event_id }])
  const [notification] = renderDiscordBatch(alerts, {
    publicUrl: env.ORCA_PUBLIC_URL,
    logoOrigin: env.ENTITY_LOGO_SERVICE_ORIGIN,
  })

  if (notification === undefined) {
    return 'skipped'
  }

  await postMessage(notification.message, notification.event_ids)
  return 'sent'
}

async function postMessage(message: Card, event_ids: string[]): Promise<void> {
  const webhook = env.ORCA_DISCORD_WEBHOOK_URL

  if (webhook === undefined || webhook === '') {
    throw new ConvexError('Set ORCA_DISCORD_WEBHOOK_URL before sending Discord events.')
  }

  const debug = `-# pre-alpha${dot}${event_ids.length === 1 ? 'event' : 'events'}: ${event_ids.join(', ')}`

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
      event_ids,
    })
  }
}
