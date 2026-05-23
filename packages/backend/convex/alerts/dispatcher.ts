import { v } from 'convex/values'
import * as R from 'remeda'

import { isNonEmptyString } from '../../shared/utils'
import { api, internal } from '../_generated/api'
import type { Doc } from '../_generated/dataModel'
import { internalAction } from '../_generated/server'
import type { EntityChange } from '../changes'
import { sendToChannel, sendToDM } from '../discord/client'
import { buildMessages } from '../discord/messages'
import type { DiscordPayload } from '../discord/utils'

type DiscordSubscription = Doc<'alerts_discord_subscriptions'>

type Delivery =
  | { type: 'channel'; channel_id: string; pattern: string; payloads: DiscordPayload[] }
  | { type: 'dm'; user_id: string; pattern: string; payloads: DiscordPayload[] }

const DELAY_BETWEEN_MESSAGES_MS = 1000

const sleep = async (ms: number) =>
  // oxlint-disable-next-line promise/avoid-new
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

// Pattern matching — "*" for all, otherwise simple includes
function matchPattern(pattern: string, slug: string): boolean {
  if (pattern === '*') {
    return true
  }
  return slug.includes(pattern)
}

// Tag a message with the subscription pattern
function stampPayload(payload: DiscordPayload, pattern: string): DiscordPayload {
  if (pattern === '*') {
    return payload
  }
  const suffix = ` (${pattern})`
  const content = isNonEmptyString(payload.content) ? `${payload.content}${suffix}` : suffix
  return { ...payload, content }
}

// Build deliveries per subscription from messages
function buildDeliveries(
  messages: { slug: string; payload: DiscordPayload }[],
  subscriptions: DiscordSubscription[],
): Delivery[] {
  const deliveries: Delivery[] = []

  for (const sub of subscriptions) {
    const matching = messages.filter((m) => matchPattern(sub.pattern, m.slug))
    if (matching.length === 0) {
      continue
    }

    const payloads = matching.map((m) => stampPayload(m.payload, sub.pattern))

    if (sub.type === 'channel' && sub.channel_id) {
      deliveries.push({
        type: 'channel',
        channel_id: sub.channel_id,
        pattern: sub.pattern,
        payloads,
      })
    } else if (sub.type === 'dm') {
      deliveries.push({ type: 'dm', user_id: sub.user_id, pattern: sub.pattern, payloads })
    }
  }

  return deliveries
}

async function sendDeliveries(deliveries: Delivery[]): Promise<void> {
  const totalPayloads = deliveries.reduce((sum, d) => sum + d.payloads.length, 0)
  let sent = 0
  let failed = 0

  console.log('[discord:bot] starting', { deliveries: deliveries.length, payloads: totalPayloads })

  for (const delivery of deliveries) {
    for (const payload of delivery.payloads) {
      try {
        await (delivery.type === 'channel'
          ? sendToChannel({ channelId: delivery.channel_id, payload })
          : sendToDM({ userId: delivery.user_id, payload }))
        sent += 1
      } catch (error) {
        failed += 1
        console.error('[discord:bot] send failed', {
          type: delivery.type,
          pattern: delivery.pattern,
          error,
        })
      }

      await sleep(DELAY_BETWEEN_MESSAGES_MS)
    }
  }

  console.log('[discord:bot] complete', { sent, failed })
}

// Main dispatcher action
export const run = internalAction({
  args: {
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    const subscriptions: DiscordSubscription[] = await ctx.runQuery(
      internal.discord.subscriptions.getActive,
    )
    if (!subscriptions.length) {
      console.log('[alerts:dispatcher] no active subscriptions')
      return
    }

    const changes: EntityChange[] = await ctx.runQuery(api.changeBatch.byCrawlId, {
      crawl_id: args.crawl_id,
    })
    if (!changes.length) {
      console.log('[alerts:dispatcher] no changes', { crawl_id: args.crawl_id })
      return
    }

    console.log('[alerts:dispatcher] processing', {
      crawl_id: args.crawl_id,
      subscriptions: subscriptions.length,
      changes: changes.length,
    })

    // Build messages from flat changes, stamp with crawl_id timestamp, serialize.
    // Discord allows max 10 embeds per message — chunk if needed.
    const MAX_EMBEDS = 10
    const timestamp = new Date(Number(args.crawl_id))
    const discordMessages = buildMessages(changes)

    const messages = discordMessages.flatMap(({ slug, embeds }) => {
      for (const embed of embeds) {
        embed.setTimestamp(timestamp.getTime())
      }
      return R.chunk(embeds, MAX_EMBEDS).map((chunk) => {
        const payload: DiscordPayload = { embeds: chunk.map((e) => e.toJSON()) }
        return { slug, payload }
      })
    })

    const deliveries = buildDeliveries(messages, subscriptions)

    if (deliveries.length > 0) {
      await sendDeliveries(deliveries)
    } else {
      console.log('[alerts:dispatcher] no matching deliveries')
    }
  },
})
