import { v } from 'convex/values'
import * as R from 'remeda'

import { isNonEmptyString } from '@/shared/utils'

import { api, internal } from '../_generated/api'
import type { Doc } from '../_generated/dataModel'
import { internalAction } from '../_generated/server'
import type { EntityChange } from '../db/or/views/changes'
import type { ChannelDelivery, DiscordDelivery, DMDelivery } from '../discord/bot'
import { sendDiscordDeliveries } from '../discord/bot'
import { buildMessages } from '../discord/messages'
import type { DiscordPayload } from '../discord/utils'

type DiscordSubscription = Doc<'alerts_discord_subscriptions'>

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
): DiscordDelivery[] {
  const deliveries: DiscordDelivery[] = []

  for (const sub of subscriptions) {
    const matching = messages.filter((m) => matchPattern(sub.pattern, m.slug))
    if (matching.length === 0) {
      continue
    }

    const payloads = matching.map((m) => stampPayload(m.payload, sub.pattern))

    if (sub.type === 'channel' && sub.channel_id) {
      const delivery: ChannelDelivery = {
        type: 'channel',
        channel_id: sub.channel_id,
        pattern: sub.pattern,
        payloads,
      }
      deliveries.push(delivery)
    } else if (sub.type === 'dm') {
      const delivery: DMDelivery = {
        type: 'dm',
        user_id: sub.user_id,
        pattern: sub.pattern,
        payloads,
      }
      deliveries.push(delivery)
    }
  }

  return deliveries
}

// Main dispatcher action
export const run = internalAction({
  args: {
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!isNonEmptyString(botToken)) {
      console.log('[alerts:dispatcher] DISCORD_BOT_TOKEN not configured, skipping')
      return
    }

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
      await sendDiscordDeliveries(deliveries, botToken)
    } else {
      console.log('[alerts:dispatcher] no matching deliveries')
    }
  },
})
