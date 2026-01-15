import { v } from 'convex/values'

import { internal } from '../_generated/api'
import type { Doc } from '../_generated/dataModel'
import { internalAction } from '../_generated/server'
import {
  sendDiscordDeliveries,
  type ChannelDelivery,
  type DiscordDelivery,
  type DMDelivery,
} from '../discord/bot'
import { buildEndpointEmbed } from '../discord/embeds/endpointEmbed'
import { buildModelEmbed } from '../discord/embeds/modelEmbed'
import type { DiscordPayload, EmbedResult } from '../discord/embeds/utils'
import type { EndpointChange, EnrichedChange, ModelChange } from './inputs'

type DiscordSubscription = Doc<'alerts_discord_subscriptions'>

// Built embed with metadata for sorting and filtering
type BuiltEmbed = {
  model_slug: string
  entity_type: 'model' | 'endpoint'
  change_kind: 'create' | 'update' | 'delete'
  result: EmbedResult
}

// Pattern matching - "*" for all, otherwise simple includes
export function matchPattern(pattern: string, slug: string): boolean {
  if (pattern === '*') return true
  return slug.includes(pattern)
}

// Sort weight for logical ordering within model_slug groups
function getSortWeight(entity_type: string, change_kind: string): number {
  if (entity_type === 'model') {
    if (change_kind === 'create') return 0
    if (change_kind === 'update') return 1
    if (change_kind === 'delete') return 5
  }
  if (entity_type === 'endpoint') {
    if (change_kind === 'create') return 2
    if (change_kind === 'update') return 3
    if (change_kind === 'delete') return 4
  }
  return 3
}

// Build all embeds from changes, grouped by entity, sorted
function buildEmbeds(changes: EnrichedChange[]): BuiltEmbed[] {
  const byEntity = Map.groupBy(changes, (c) =>
    c.entity_type === 'model' ? `model:${c.model_slug}` : `endpoint:${c.endpoint_uuid}`,
  )

  const embeds: BuiltEmbed[] = []

  for (const entityChanges of byEntity.values()) {
    const first = entityChanges[0]
    if (!first) continue

    const result =
      first.entity_type === 'model'
        ? buildModelEmbed(entityChanges as ModelChange[])
        : buildEndpointEmbed(entityChanges as EndpointChange[])

    embeds.push({
      model_slug: first.model_slug,
      entity_type: first.entity_type,
      change_kind: first.change_kind,
      result,
    })
  }

  // Sort by model_slug, then by logical order within
  return embeds.toSorted((a, b) => {
    const slugCompare = a.model_slug.localeCompare(b.model_slug)
    if (slugCompare !== 0) return slugCompare
    return getSortWeight(a.entity_type, a.change_kind) - getSortWeight(b.entity_type, b.change_kind)
  })
}

// Stamp an embed for a specific subscription
function stampEmbed(built: BuiltEmbed, pattern: string): DiscordPayload {
  // Clone to avoid mutation across subscriptions
  const embed = { ...built.result, footer: { text: `pattern: ${pattern}` } }
  return { embeds: [embed] }
}

// Box embeds into deliveries per subscription
function buildDeliveries(
  embeds: BuiltEmbed[],
  subscriptions: DiscordSubscription[],
): DiscordDelivery[] {
  const deliveries: DiscordDelivery[] = []

  for (const sub of subscriptions) {
    const matching = embeds.filter((e) => matchPattern(sub.pattern, e.model_slug))
    if (matching.length === 0) continue

    const payloads = matching.map((e) => stampEmbed(e, sub.pattern))

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
    if (!botToken) {
      console.log('[alerts:dispatcher] DISCORD_BOT_TOKEN not configured, skipping')
      return
    }

    const subscriptions = await ctx.runQuery(internal.discord.subscriptions.getActive)
    if (!subscriptions.length) {
      console.log('[alerts:dispatcher] no active subscriptions')
      return
    }

    const changes = await ctx.runQuery(internal.alerts.inputs.changesByCrawlId, {
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

    // Build → Sort → Box
    const embeds = buildEmbeds(changes)
    const deliveries = buildDeliveries(embeds, subscriptions)

    if (deliveries.length > 0) {
      await sendDiscordDeliveries(deliveries, botToken)
    } else {
      console.log('[alerts:dispatcher] no matching deliveries')
    }
  },
})
