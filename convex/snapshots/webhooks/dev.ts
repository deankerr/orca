import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction } from '../../_generated/server'
import { getEnv } from '../../lib/env'
import { buildDeliveries, type Subscription } from './main'
import { sendDeliveries } from './send'

/**
 * Dev testing action. Sends webhook payloads to your dev channel.
 *
 * Options:
 * - crawlIds: specific crawl_id(s) to process
 * - lastN: auto-fetch last N crawl batches with changes
 * - pattern: filter models by pattern ("*", "deepseek/*", "*mistral*", or exact slug)
 * - webhookUrl: override webhook URL (defaults to DISCORD_WEBHOOK_URL_DEV env var)
 * - dryRun: build payloads without sending
 */
export const test = internalAction({
  args: {
    // * source: either specific crawl_ids or last N
    crawlIds: v.optional(v.union(v.string(), v.array(v.string()))),
    lastN: v.optional(v.number()),

    // * filtering: pattern matching ("*", "deepseek/*", "*mistral*", etc.)
    pattern: v.optional(v.string()),

    // * options
    webhookUrl: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const webhookUrl = args.webhookUrl ?? getEnv('DISCORD_WEBHOOK_URL_DEV')
    const dryRun = args.dryRun ?? false
    const pattern = args.pattern ?? '*'

    // * resolve crawl_ids
    let crawlIds: string[]
    if (args.crawlIds) {
      crawlIds = Array.isArray(args.crawlIds) ? args.crawlIds : [args.crawlIds]
    } else if (args.lastN) {
      crawlIds = await ctx.runQuery(internal.snapshots.webhooks.inputs.getRecentCrawlIds, {
        limit: args.lastN,
      })
    } else {
      throw new Error('Must provide crawlIds or lastN')
    }

    if (!crawlIds.length) {
      console.log('[webhooks:dev] no crawl_ids to process')
      return
    }

    // * create dynamic subscription for dev testing
    const subscriptions: Subscription[] = [{ pattern, webhook_url: webhookUrl, label: 'dev.test' }]

    // * fetch all changes across crawl_ids
    const allChanges = await Promise.all(
      crawlIds.map((crawl_id) =>
        ctx.runQuery(internal.snapshots.webhooks.inputs.changesByCrawlId, { crawl_id }),
      ),
    )
    const changes = allChanges.flat()

    if (!changes.length) {
      console.log('[webhooks:dev] no changes found')
      return
    }

    // * build deliveries
    const deliveries = buildDeliveries({
      changes,
      subscriptions,
    })

    if (!deliveries.length) {
      console.log('[webhooks:dev] no matching changes')
      return
    }

    const totalPayloads = deliveries.reduce((sum, d) => sum + d.payloads.length, 0)

    console.log('[webhooks:dev]', {
      crawlIds: crawlIds.length,
      changes: changes.length,
      payloads: totalPayloads,
      dryRun,
    })

    if (!dryRun) {
      await sendDeliveries(deliveries)
    }
  },
})
