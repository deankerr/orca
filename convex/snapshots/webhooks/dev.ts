import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import type { Doc } from '../../_generated/dataModel'
import { internalAction } from '../../_generated/server'
import { getEnv } from '../../lib/utils'
import { formatWebhookPayload } from './discord'
import { buildWebhookDeliveries, type WebhookDelivery } from './send'

type Change = Doc<'or_views_changes'>
type Subscription = Doc<'webhook_subscriptions'>

const MATCH_ALL = '*'

// * helper: create fake subscriptions for testing
function createTestSubscriptions(args: {
  webhookUrl: string
  modelSlugs: string[] | typeof MATCH_ALL
  allChangeSlugs: string[]
}): Subscription[] {
  const { webhookUrl, modelSlugs, allChangeSlugs } = args

  // * if match all, use all unique slugs from changes
  const slugs = modelSlugs === MATCH_ALL ? allChangeSlugs : modelSlugs

  return slugs.map((slug) => ({
    _id: 'dev' as any,
    _creationTime: Date.now(),
    model_slug: slug,
    webhook_url: webhookUrl,
    enabled: true,
  }))
}

// * helper: extract unique model_slugs from changes
function getUniqueSlugs(changes: Change[]): string[] {
  return [...new Set(changes.filter((c) => 'model_slug' in c).map((c) => (c as any).model_slug))]
}

// * helper: send delivery with logging
async function sendDelivery(
  delivery: WebhookDelivery,
  label: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(delivery.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delivery.payload),
    })

    if (!response.ok) {
      const text = await response.text()
      const error = `${response.status}: ${text.slice(0, 200)}`
      console.error(`[webhooks:dev] ${label} failed`, { error })
      return { success: false, error }
    }

    console.log(`[webhooks:dev] ${label} sent`, {
      embeds: delivery.payload.embeds.length,
    })
    return { success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[webhooks:dev] ${label} failed`, { error })
    return { success: false, error }
  }
}

// * helper: sleep for ms
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Main dev testing action. Sends webhook payloads to your dev channel.
 *
 * Options:
 * - crawlIds: specific crawl_id(s) to process
 * - lastN: auto-fetch last N crawl batches with changes
 * - modelSlugs: filter to specific models, or "*" to match all
 * - delayMs: delay between batches (default 1000ms)
 * - webhookUrl: override webhook URL (defaults to DISCORD_WEBHOOK_URL_DEV env var)
 * - dryRun: build payloads without sending
 */
export const test = internalAction({
  args: {
    // * source: either specific crawl_ids or last N
    crawlIds: v.optional(v.union(v.string(), v.array(v.string()))),
    lastN: v.optional(v.number()),

    // * filtering: specific slugs or "*" for all
    modelSlugs: v.optional(v.union(v.literal(MATCH_ALL), v.array(v.string()))),

    // * options
    delayMs: v.optional(v.number()),
    webhookUrl: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // * resolve webhook URL
    const webhookUrl = args.webhookUrl ?? getEnv('DISCORD_WEBHOOK_URL_DEV')
    const dryRun = args.dryRun ?? false
    const delayMs = args.delayMs ?? 1000

    // * resolve crawl_ids
    let crawlIds: string[]
    if (args.crawlIds) {
      crawlIds = Array.isArray(args.crawlIds) ? args.crawlIds : [args.crawlIds]
    } else if (args.lastN) {
      crawlIds = await ctx.runQuery(internal.db.or.views.changes.listRecentCrawlIds, {
        limit: args.lastN,
      })
    } else {
      throw new Error('Must provide crawlIds or lastN')
    }

    if (!crawlIds.length) {
      console.log('[webhooks:dev] no crawl_ids to process')
      return { sent: 0, failed: 0 }
    }

    console.log('[webhooks:dev] starting', {
      crawlIds: crawlIds.length,
      modelSlugs: args.modelSlugs ?? 'all',
      dryRun,
      delayMs,
    })

    const results = { sent: 0, failed: 0, skipped: 0 }

    // * process each crawl_id
    for (let i = 0; i < crawlIds.length; i++) {
      const crawl_id = crawlIds[i]!

      // * fetch changes
      const changes = await ctx.runQuery(internal.db.or.views.changes.listByCrawlId, { crawl_id })

      if (!changes.length) {
        console.log(`[webhooks:dev] [${i + 1}/${crawlIds.length}] no changes`, { crawl_id })
        results.skipped++
        continue
      }

      // * build subscriptions
      const allSlugs = getUniqueSlugs(changes)
      const subscriptions = createTestSubscriptions({
        webhookUrl,
        modelSlugs: args.modelSlugs ?? MATCH_ALL,
        allChangeSlugs: allSlugs,
      })

      // * build deliveries
      const deliveries = buildWebhookDeliveries({ changes, subscriptions, crawl_id })

      if (!deliveries.length) {
        console.log(`[webhooks:dev] [${i + 1}/${crawlIds.length}] no matching changes`, {
          crawl_id,
          totalChanges: changes.length,
        })
        results.skipped++
        continue
      }

      console.log(`[webhooks:dev] [${i + 1}/${crawlIds.length}] processing`, {
        crawl_id,
        changes: changes.length,
        deliveries: deliveries.length,
        embeds: deliveries.reduce((sum, d) => sum + d.payload.embeds.length, 0),
      })

      // * send or dry-run
      for (const delivery of deliveries) {
        if (dryRun) {
          console.log(`[webhooks:dev] [${i + 1}/${crawlIds.length}] dry-run`, {
            crawl_id,
            embeds: delivery.payload.embeds.length,
          })
          results.sent++
        } else {
          const result = await sendDelivery(delivery, `[${i + 1}/${crawlIds.length}]`)
          if (result.success) {
            results.sent++
          } else {
            results.failed++
          }
        }
      }

      // * delay between batches (except last)
      if (i < crawlIds.length - 1 && delayMs > 0 && !dryRun) {
        await sleep(delayMs)
      }
    }

    console.log('[webhooks:dev] complete', results)
    return results
  },
})

/**
 * Preview what a webhook would look like for specific changes.
 * Useful for testing formatting without sending anything.
 */
export const preview = internalAction({
  args: {
    crawlId: v.string(),
    modelSlugs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const changes = await ctx.runQuery(internal.db.or.views.changes.listByCrawlId, {
      crawl_id: args.crawlId,
    })

    const allSlugs = getUniqueSlugs(changes)
    const slugsToUse = args.modelSlugs ?? allSlugs

    // * filter changes to requested slugs
    const filteredChanges = changes
      .filter((c) => {
        const slug = 'model_slug' in c ? c.model_slug : undefined
        return slug && slugsToUse.includes(slug)
      })
      .filter((c) => c.entity_type !== 'provider')

    const payload = formatWebhookPayload(filteredChanges, args.crawlId)

    console.log('[webhooks:dev:preview]', {
      crawlId: args.crawlId,
      totalChanges: changes.length,
      filteredChanges: filteredChanges.length,
      embeds: payload.embeds.length,
      slugs: slugsToUse,
    })

    return payload
  },
})

/**
 * Send a raw payload directly to the dev webhook.
 */
export const sendRaw = internalAction({
  args: {
    payload: v.any(),
    webhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const webhookUrl = args.webhookUrl ?? getEnv('DISCORD_WEBHOOK_URL_DEV')

    const delivery: WebhookDelivery = {
      webhookUrl,
      modelSlugs: ['raw'],
      payload: args.payload,
    }

    return await sendDelivery(delivery, 'raw')
  },
})
