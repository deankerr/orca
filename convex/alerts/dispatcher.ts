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
import { buildMarkdownLinks } from '../discord/embeds/components'
import { buildEndpointEmbed } from '../discord/embeds/endpointEmbed'
import { buildModelEmbed } from '../discord/embeds/modelEmbed'
import type { DiscordPayload, EmbedResult } from '../discord/embeds/utils'
import type { EnrichedChange } from '../snapshots/webhooks/inputs'
import { transformEndpoint } from '../transforms/endpoint'

// Pattern matching - "*" for all, otherwise simple includes
export function matchPattern(pattern: string, slug: string): boolean {
  if (pattern === '*') return true
  return slug.includes(pattern)
}

// Group changes by entity (model or endpoint) AND crawl_id
function groupChangesByEntity(changes: EnrichedChange[]): Map<string, EnrichedChange[]> {
  return Map.groupBy(changes, (c) =>
    c.raw.entity_type === 'model'
      ? `model:${c.raw.model_slug}:${c.raw.crawl_id}`
      : `endpoint:${c.raw.endpoint_uuid}:${c.raw.crawl_id}`,
  )
}

type DiscordSubscription = Doc<'discord_alert_subscriptions'>

// Build a single Discord payload for an entity's changes
function buildPayload(args: {
  entityChanges: EnrichedChange[]
  subscription: DiscordSubscription
  crawl_id: string
}): DiscordPayload | null {
  const { entityChanges, subscription, crawl_id } = args
  const first = entityChanges[0]
  if (!first) return null

  const { raw, model, endpoint } = first
  const change_kind = raw.change_kind as 'create' | 'update' | 'delete'

  let result: EmbedResult

  if (raw.entity_type === 'model') {
    const changes = entityChanges
      .filter((c) => c.raw.change_kind === 'update')
      .map((c) => ({
        path: c.raw.path,
        path_level_1: c.raw.path_level_1,
        path_level_2: c.raw.path_level_2,
        before: c.raw.before,
        after: c.raw.after,
      }))

    result = buildModelEmbed({
      model_slug: raw.model_slug,
      change_kind,
      model: model
        ? {
            name: model.name,
            slug: model.slug,
            description: model.description,
            input_modalities: model.input_modalities,
            output_modalities: model.output_modalities,
            reasoning: model.reasoning,
            tokenizer: model.tokenizer,
            warning_message: model.warning_message,
            promotion_message: model.promotion_message,
            hugging_face_id: model.hugging_face_id,
          }
        : null,
      changes,
    })
  } else if (raw.entity_type === 'endpoint') {
    const changes = entityChanges
      .filter((c) => c.raw.change_kind === 'update')
      .map((c) => ({
        path: c.raw.path,
        path_level_1: c.raw.path_level_1,
        path_level_2: c.raw.path_level_2,
        before: c.raw.before,
        after: c.raw.after,
      }))

    result = buildEndpointEmbed({
      model_slug: raw.model_slug,
      endpoint_uuid: raw.endpoint_uuid,
      change_kind,
      endpoint: endpoint ? transformEndpoint(endpoint) : null,
      provider_name: endpoint?.provider.name ?? raw.provider_tag_slug ?? 'Unknown',
      provider_tag_slug: endpoint?.provider.tag_slug ?? raw.provider_tag_slug,
      hugging_face_id: model?.hugging_face_id,
      changes,
    })
  } else {
    return null
  }

  // Add footer with subscription pattern and timestamp
  result.embed.footer = { text: subscription.pattern }
  result.embed.timestamp = new Date(parseInt(crawl_id)).toISOString()

  // Add links as a field
  const linksMarkdown = buildMarkdownLinks(result.links)
  result.embed.fields = [
    ...(result.embed.fields ?? []),
    { name: 'links', value: linksMarkdown, inline: false },
  ]

  return { embeds: [result.embed] }
}

// Sort weight for logical ordering
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

type PayloadWithMeta = {
  payload: DiscordPayload
  model_slug: string
  entity_type: string
  change_kind: string
}

// Build Discord deliveries for all subscriptions
function buildDiscordDeliveries(args: {
  changes: EnrichedChange[]
  subscriptions: DiscordSubscription[]
  crawl_id: string
}): DiscordDelivery[] {
  const { changes, subscriptions, crawl_id } = args
  const deliveries: DiscordDelivery[] = []

  const byEntity = groupChangesByEntity(changes)

  for (const sub of subscriptions) {
    const payloadsWithMeta: PayloadWithMeta[] = []

    for (const [_entityKey, entityChanges] of byEntity) {
      const first = entityChanges[0]
      if (!first) continue

      const model_slug = first.raw.model_slug
      if (!model_slug || !matchPattern(sub.pattern, model_slug)) continue

      const payload = buildPayload({ entityChanges, subscription: sub, crawl_id })
      if (!payload) continue

      payloadsWithMeta.push({
        payload,
        model_slug,
        entity_type: first.raw.entity_type,
        change_kind: first.raw.change_kind,
      })
    }

    if (payloadsWithMeta.length === 0) continue

    // Sort by model_slug then by logical order
    payloadsWithMeta.sort((a, b) => {
      const slugCompare = a.model_slug.localeCompare(b.model_slug)
      if (slugCompare !== 0) return slugCompare
      return (
        getSortWeight(a.entity_type, a.change_kind) - getSortWeight(b.entity_type, b.change_kind)
      )
    })

    const payloads = payloadsWithMeta.map((p) => p.payload)

    // Create delivery based on subscription type
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

    // Load Discord subscriptions
    const discordSubs = await ctx.runQuery(internal.discord.subscriptions.getActive)

    if (!discordSubs.length) {
      console.log('[alerts:dispatcher] no active Discord subscriptions')
      return
    }

    // Load changes
    const changes = await ctx.runQuery(internal.snapshots.webhooks.inputs.changesByCrawlId, {
      crawl_id: args.crawl_id,
    })

    if (!changes.length) {
      console.log('[alerts:dispatcher] no changes for crawl', { crawl_id: args.crawl_id })
      return
    }

    console.log('[alerts:dispatcher] processing', {
      crawl_id: args.crawl_id,
      discordSubs: discordSubs.length,
      changes: changes.length,
    })

    // Build and send Discord deliveries
    const discordDeliveries = buildDiscordDeliveries({
      changes,
      subscriptions: discordSubs,
      crawl_id: args.crawl_id,
    })

    if (discordDeliveries.length > 0) {
      console.log('[alerts:dispatcher] sending Discord deliveries', {
        deliveries: discordDeliveries.length,
        totalPayloads: discordDeliveries.reduce((sum, d) => sum + d.payloads.length, 0),
      })
      await sendDiscordDeliveries(discordDeliveries, botToken)
    } else {
      console.log('[alerts:dispatcher] no matching Discord deliveries')
    }
  },
})
