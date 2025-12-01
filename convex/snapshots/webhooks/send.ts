import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { internalAction } from '../../_generated/server'
import { getErrorMessage } from '../../shared'
import { formatWebhookPayload, type DiscordWebhookPayload } from './discord'

type Change = Doc<'or_views_changes'>
type Subscription = Doc<'webhook_subscriptions'>

export type WebhookDelivery = {
  webhookUrl: string
  modelSlugs: string[]
  payload: DiscordWebhookPayload
}

// * pure function: takes changes and subscriptions, returns deliveries to send
export function buildWebhookDeliveries(args: {
  changes: Change[]
  subscriptions: Subscription[]
  crawl_id: string
}): WebhookDelivery[] {
  const { changes, subscriptions, crawl_id } = args

  // * group subscriptions by webhook_url
  const byWebhookUrl = new Map<string, string[]>()
  for (const sub of subscriptions) {
    const existing = byWebhookUrl.get(sub.webhook_url) ?? []
    existing.push(sub.model_slug)
    byWebhookUrl.set(sub.webhook_url, existing)
  }

  // * build set of subscribed model_slugs for fast lookup
  const subscribedSlugs = new Set(subscriptions.map((s) => s.model_slug))

  // * filter changes to only those matching subscriptions
  const relevantChanges = changes.filter((c) => {
    const slug = 'model_slug' in c ? c.model_slug : undefined
    return slug && subscribedSlugs.has(slug)
  })

  // * build deliveries for each webhook destination
  const deliveries: WebhookDelivery[] = []

  for (const [webhookUrl, modelSlugs] of byWebhookUrl) {
    const slugSet = new Set(modelSlugs)
    const destChanges = relevantChanges
      .filter((c) => {
        const slug = 'model_slug' in c ? c.model_slug : undefined
        return slug && slugSet.has(slug)
      })
      .filter((c) => c.entity_type !== 'provider')

    if (!destChanges.length) continue

    const payload = formatWebhookPayload(destChanges, crawl_id)
    deliveries.push({ webhookUrl, modelSlugs, payload })
  }

  return deliveries
}

// * send a single delivery to Discord
async function sendDelivery(
  delivery: WebhookDelivery,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(delivery.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delivery.payload),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `${response.status}: ${text.slice(0, 200)}` }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

// * main action: fetch data, build deliveries, send
export const sendForCrawl = internalAction({
  args: {
    crawl_id: v.string(),
  },
  handler: async (ctx, args) => {
    // * get enabled subscriptions
    const subscriptions = await ctx.runQuery(internal.db.webhook.subscriptions.listEnabled)

    if (!subscriptions.length) {
      console.log('[webhooks] no enabled subscriptions')
      return
    }

    // * get all changes for this crawl
    const changes = await ctx.runQuery(internal.db.or.views.changes.listByCrawlId, {
      crawl_id: args.crawl_id,
    })

    if (!changes.length) {
      console.log('[webhooks] no changes for crawl', { crawl_id: args.crawl_id })
      return
    }

    console.log('[webhooks] processing', {
      crawl_id: args.crawl_id,
      subscriptions: subscriptions.length,
      totalChanges: changes.length,
    })

    // * build deliveries
    const deliveries = buildWebhookDeliveries({
      changes,
      subscriptions,
      crawl_id: args.crawl_id,
    })

    if (!deliveries.length) {
      console.log('[webhooks] no deliveries to send (no matching changes)')
      return
    }

    // * send each delivery
    for (const delivery of deliveries) {
      const result = await sendDelivery(delivery)

      if (result.success) {
        console.log('[webhooks] sent', {
          crawl_id: args.crawl_id,
          modelSlugs: delivery.modelSlugs,
          embeds: delivery.payload.embeds.length,
        })
      } else {
        console.error('[webhooks] failed', {
          error: result.error,
          modelSlugs: delivery.modelSlugs,
        })
      }
    }
  },
})
