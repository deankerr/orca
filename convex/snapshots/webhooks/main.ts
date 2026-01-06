import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { transformEndpoint } from '../../transforms/endpoint'
import { buildMarkdownLinks } from './discord/components'
import { buildEndpointEmbed } from './discord/endpointEmbed'
import { buildModelEmbed } from './discord/modelEmbed'
import type { DiscordPayload, EmbedResult } from './discord/utils'
import type { EnrichedChange } from './inputs'
import { sendDeliveries, type Delivery } from './send'

// Pattern matching
// Supports: "*" (all), "foo*", "*foo", "*foo*", "exact"

export function matchPattern(pattern: string, slug: string): boolean {
  if (pattern === '*') return true

  if (pattern.startsWith('*') && pattern.endsWith('*') && pattern.length > 2) {
    const inner = pattern.slice(1, -1)
    return slug.includes(inner)
  }

  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return slug.startsWith(prefix)
  }

  if (pattern.startsWith('*')) {
    const suffix = pattern.slice(1)
    return slug.endsWith(suffix)
  }

  return pattern === slug
}

export type Subscription = {
  pattern: string
  webhook_url: string
  label?: string
}

// Group changes by entity (model or endpoint) AND crawl_id
// This prevents merging changes from different snapshots
function groupChangesByEntity(changes: EnrichedChange[]): Map<string, EnrichedChange[]> {
  return Map.groupBy(changes, (c) =>
    c.raw.entity_type === 'model'
      ? `model:${c.raw.model_slug}:${c.raw.crawl_id}`
      : `endpoint:${c.raw.endpoint_uuid}:${c.raw.crawl_id}`,
  )
}

// Build a single payload for an entity's changes
function buildPayload(args: {
  entityChanges: EnrichedChange[]
  subscription: Subscription
}): DiscordPayload | null {
  const { entityChanges, subscription } = args
  const first = entityChanges[0]
  if (!first) return null

  const { raw, model, endpoint } = first
  const change_kind = raw.change_kind as 'create' | 'update' | 'delete'

  let result: EmbedResult

  if (raw.entity_type === 'model') {
    // Collect field changes for updates
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
    // Collect field changes for updates
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

  // Add footer with subscription label and timestamp
  result.embed.footer = { text: subscription.label ?? 'ORCA Monitor' }
  result.embed.timestamp = new Date(parseInt(raw.crawl_id)).toISOString()

  // Add links as a field at the end (components only work with application-owned webhooks)
  const linksMarkdown = buildMarkdownLinks(result.links)
  result.embed.fields = [
    ...(result.embed.fields ?? []),
    { name: 'links', value: linksMarkdown, inline: false },
  ]

  return { embeds: [result.embed] }
}

// Sort weight for logical ordering of changes
// Model lifecycle: create -> update -> (endpoints) -> delete
// Endpoint lifecycle: create -> update -> delete (within model context)
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
  return 3 // default to middle
}

type PayloadWithMeta = {
  payload: DiscordPayload
  model_slug: string
  entity_type: string
  change_kind: string
}

// Build deliveries for all subscriptions
// Pure function: takes inputs, returns deliveries ready to send
export function buildDeliveries(args: {
  changes: EnrichedChange[]
  subscriptions: Subscription[]
}): Delivery[] {
  const { changes, subscriptions } = args
  const deliveries: Delivery[] = []

  // Group by entity first
  const byEntity = groupChangesByEntity(changes)

  for (const sub of subscriptions) {
    // Collect all payloads for this subscription with metadata
    const payloadsWithMeta: PayloadWithMeta[] = []

    for (const [_entityKey, entityChanges] of byEntity) {
      const first = entityChanges[0]
      if (!first) continue

      const model_slug = first.raw.model_slug
      if (!model_slug || !matchPattern(sub.pattern, model_slug)) continue

      const payload = buildPayload({ entityChanges, subscription: sub })
      if (!payload) continue

      payloadsWithMeta.push({
        payload,
        model_slug,
        entity_type: first.raw.entity_type,
        change_kind: first.raw.change_kind,
      })
    }

    // Sort: group by model_slug, then by logical order within each model
    payloadsWithMeta.sort((a, b) => {
      // First sort by model_slug to group related changes
      const slugCompare = a.model_slug.localeCompare(b.model_slug)
      if (slugCompare !== 0) return slugCompare

      // Then sort by logical weight within the same model
      return (
        getSortWeight(a.entity_type, a.change_kind) - getSortWeight(b.entity_type, b.change_kind)
      )
    })

    // Convert to deliveries
    for (const { payload } of payloadsWithMeta) {
      deliveries.push({
        webhookUrl: sub.webhook_url,
        payloads: [payload],
      })
    }
  }

  return deliveries
}

// Main action: fetch inputs, build deliveries, send
export const run = internalAction({
  args: {
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.runQuery(
      internal.snapshots.webhooks.inputs.getEnabledSubscriptions,
    )

    if (!subscriptions.length) {
      console.log('[webhooks] no enabled subscriptions')
      return
    }

    const changes = await ctx.runQuery(internal.snapshots.webhooks.inputs.changesByCrawlId, {
      crawl_id: args.crawl_id,
    })

    if (!changes.length) {
      console.log('[webhooks] no changes for crawl', { crawl_id: args.crawl_id })
      return
    }

    console.log('[webhooks] processing', {
      crawl_id: args.crawl_id,
      subscriptions: subscriptions.length,
      changes: changes.length,
    })

    const deliveries = buildDeliveries({
      changes,
      subscriptions,
    })

    if (!deliveries.length) {
      console.log('[webhooks] no matching changes for any subscription')
      return
    }

    await sendDeliveries(deliveries)
  },
})
