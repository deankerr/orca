import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { generateDiscordEmbeds, type DiscordPayload } from './embeds'
import type { WebhookChange } from './inputs'
import { sendDeliveries, type Delivery } from './send'

// * Pattern matching
// Supports: "*" (all), "foo*", "*foo", "*foo*", "exact"

export function matchPattern(pattern: string, slug: string): boolean {
  // * match all
  if (pattern === '*') return true

  // * contains (*foo*)
  if (pattern.startsWith('*') && pattern.endsWith('*') && pattern.length > 2) {
    const inner = pattern.slice(1, -1)
    return slug.includes(inner)
  }

  // * prefix (foo*)
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return slug.startsWith(prefix)
  }

  // * suffix (*foo)
  if (pattern.startsWith('*')) {
    const suffix = pattern.slice(1)
    return slug.endsWith(suffix)
  }

  // * exact match
  return pattern === slug
}

// * Types

export type Subscription = {
  pattern: string
  webhook_url: string
  label?: string
}

type MessageOptions = {
  prefix?: string // e.g., "[DEV]"
  body?: string // e.g., "🚨 ORCA Monitor"
  suffix?: string // e.g., crawl_id
}

function buildContent(args: { subscription: Subscription; message?: MessageOptions }): string {
  const { subscription, message } = args
  const { prefix, body, suffix } = message ?? {}

  const subInfo = `⚪ label: \`${subscription.label}\` ⚫︎ matched: \`${subscription.pattern}\``

  return [prefix, body || subInfo, suffix].filter(Boolean).join(' ')
}

// * Build deliveries for all subscriptions
// Pure function: takes inputs, returns deliveries ready to send

export function buildDeliveries(args: {
  changes: WebhookChange[]
  subscriptions: Subscription[]
  message?: MessageOptions
}): Delivery[] {
  const { changes, subscriptions, message } = args
  const deliveries: Delivery[] = []

  for (const sub of subscriptions) {
    // * filter changes by subscription pattern
    const matching = changes.filter((c) => matchPattern(sub.pattern, c.model_slug))

    if (matching.length === 0) continue

    // * generate chunked embeds
    const chunks = generateDiscordEmbeds(matching)

    if (chunks.length === 0) continue

    // * build content with subscription info
    const content = buildContent({ subscription: sub, message })

    // * build payloads (content only on first message)
    const payloads: DiscordPayload[] = chunks.map((embeds, i) => ({
      content: i === 0 ? content : undefined,
      embeds,
    }))

    deliveries.push({
      webhookUrl: sub.webhook_url,
      payloads,
    })
  }

  return deliveries
}

// * Main action: fetch inputs, build deliveries, send

export const run = internalAction({
  args: {
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    // * get enabled subscriptions
    const subscriptions = await ctx.runQuery(
      internal.snapshots.webhooks.inputs.getEnabledSubscriptions,
    )

    if (!subscriptions.length) {
      console.log('[webhooks] no enabled subscriptions')
      return
    }

    // * get changes for this crawl
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

    // * build deliveries
    const deliveries = buildDeliveries({
      changes,
      subscriptions,
      message: { suffix: `\`${args.crawl_id}\`` },
    })

    if (!deliveries.length) {
      console.log('[webhooks] no matching changes for any subscription')
      return
    }

    // * send
    await sendDeliveries(deliveries)
  },
})
