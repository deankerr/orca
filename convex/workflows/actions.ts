/**
 * Workflow Step Actions
 *
 * These are thin wrappers around existing functionality that can be called
 * as workflow steps. They provide the interface between the workflow
 * orchestration and the actual implementation.
 *
 * DESIGN PRINCIPLE:
 * Keep these wrappers thin - all complex logic stays in the original modules.
 * These just adapt the return types for workflow consumption.
 */
import { v } from 'convex/values'
import { gzipSync } from 'fflate'
import prettyBytes from 'pretty-bytes'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import { getErrorMessage } from '../shared/utils'
import {
  orFetch,
  storeCrawlBundle,
  type CrawlArchiveBundle,
} from '../snapshots/crawl/main'
import { materializeModelEndpoints } from '../snapshots/materialize/main'
import { getArchiveBundleOrThrow } from '../snapshots/shared/bundle'
import { paginateAndProcess } from '../lib/paginateAndProcess'
import { computeMaterializedChanges } from '../snapshots/materializedChanges/process'

// ============================================================================
// CRAWL ACTION
// ============================================================================

/**
 * Crawl Action for Workflow
 *
 * Performs the API crawl and returns structured results.
 * This is essentially the existing crawl.main.run without the scheduler call.
 */
export const crawl = internalAction({
  args: {
    uptimes: v.boolean(),
    topApps: v.boolean(),
    analytics: v.boolean(),
  },
  returns: v.object({
    crawl_id: v.string(),
    totals: v.object({
      models: v.number(),
      endpoints: v.number(),
      providers: v.number(),
      uptimes: v.number(),
      analytics: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const crawl_id = Date.now().toString()
    console.log('[workflow:crawl] starting', { crawl_id, ...args })

    // Import the crawl logic dynamically to avoid circular deps
    // In a real implementation, refactor crawl/main.ts to export these
    const { ModelsDataRecordArray, DataRecord, DataRecordArray, fetchModelData } =
      await import('../snapshots/crawl/main')

    const bundle: CrawlArchiveBundle = {
      crawl_id,
      args,
      data: {
        providers: [],
        modelAuthors: [],
        models: [],
      },
    }

    // Providers
    try {
      bundle.data.providers = await orFetch('/api/frontend/all-providers', {
        schema: DataRecordArray,
      })
    } catch (err) {
      console.error('[workflow:crawl:providers]', { error: getErrorMessage(err) })
    }

    // Models
    const models = await orFetch('/api/frontend/models', {
      schema: ModelsDataRecordArray,
    })

    for (const model of models) {
      const modelData = await fetchModelData(args, model)
      bundle.data.models.push(modelData)
    }

    // Analytics
    if (args.analytics) {
      try {
        bundle.data.analytics = await orFetch('/api/frontend/models/find', {
          schema: DataRecord,
        })
      } catch (err) {
        console.error('[workflow:crawl:analytics]', { error: getErrorMessage(err) })
      }
    }

    // Store the bundle
    await storeCrawlBundle(ctx, bundle)

    const totals = {
      models: bundle.data.models.length,
      endpoints: bundle.data.models.reduce((sum, m) => sum + m.endpoints.length, 0),
      providers: bundle.data.providers.length,
      uptimes: bundle.data.models.reduce((sum, m) => sum + m.uptimes.length, 0),
      analytics: bundle.data.analytics ? 1 : 0,
    }

    console.log('[workflow:crawl] complete', { crawl_id, totals })

    return { crawl_id, totals }
  },
})

// ============================================================================
// MATERIALIZE ACTION
// ============================================================================

/**
 * Materialize Action for Workflow
 *
 * Transforms raw bundle into normalized views.
 */
export const materialize = internalAction({
  args: {
    crawl_id: v.string(),
  },
  returns: v.object({
    models: v.number(),
    endpoints: v.number(),
    providers: v.number(),
  }),
  handler: async (ctx, args) => {
    const bundle = await getArchiveBundleOrThrow(ctx, args.crawl_id)

    console.log('[workflow:materialize] starting', { crawl_id: bundle.crawl_id })

    const { models, endpoints, providers, sources } = materializeModelEndpoints(bundle)

    if (endpoints.length === 0) {
      console.warn('[workflow:materialize] abort: no endpoints found')
      return { models: 0, endpoints: 0, providers: 0 }
    }

    await ctx.runMutation(internal.snapshots.materialize.output.upsert, {
      models,
      endpoints,
      providers,
      crawl_id: bundle.crawl_id,
    })

    await ctx.runMutation(internal.snapshots.materialize.output.upsertSources, {
      sources,
    })

    console.log('[workflow:materialize] complete', {
      crawl_id: bundle.crawl_id,
      models: models.length,
      endpoints: endpoints.length,
      providers: providers.length,
    })

    return {
      models: models.length,
      endpoints: endpoints.length,
      providers: providers.length,
    }
  },
})

// ============================================================================
// DETECT CHANGES ACTION
// ============================================================================

/**
 * Detect Changes Action for Workflow
 *
 * Compares consecutive snapshots and outputs field-level diffs.
 *
 * NOTE: This is a simplified version that processes a single pair.
 * For backlog processing, the workflow should loop with fromCrawlId.
 */
export const detectChanges = internalAction({
  args: {
    crawl_id: v.string(),
    fromCrawlId: v.optional(v.string()),
  },
  returns: v.object({
    processedPairs: v.number(),
    changesDetected: v.number(),
  }),
  handler: async (ctx, args) => {
    const { getArchiveBundle } = await import('../snapshots/shared/bundle')

    // Get the starting point
    const fromCrawlId =
      args.fromCrawlId ??
      (await ctx.runQuery(internal.snapshots.materializedChanges.inputs.getLatestCrawlId)) ??
      undefined

    let processedPairs = 0
    let totalChanges = 0
    let previous: { crawl_id: string; materialized: ReturnType<typeof materializeModelEndpoints> } | null = null
    let lastProcessedCrawlId: string | null = null

    // Process archives in order
    await paginateAndProcess(ctx, {
      queryFnArgs: { fromCrawlId },
      queryFn: async (innerCtx, queryArgs) =>
        await innerCtx.runQuery(
          internal.snapshots.materializedChanges.inputs.listArchives,
          queryArgs,
        ),
      processFn: async (archives) => {
        for (const archive of archives) {
          const bundle = await getArchiveBundle(ctx, archive.crawl_id)
          if (!bundle) continue

          const materialized = materializeModelEndpoints(bundle)
          const current = { crawl_id: archive.crawl_id, materialized }

          if (!previous) {
            previous = current
            lastProcessedCrawlId = current.crawl_id
            continue
          }

          const changes = computeMaterializedChanges({
            previous: previous.materialized,
            current: current.materialized,
            previous_crawl_id: previous.crawl_id,
            crawl_id: current.crawl_id,
          })

          if (changes.length) {
            await ctx.runMutation(
              internal.snapshots.materializedChanges.output.upsert,
              {
                previous_crawl_id: previous.crawl_id,
                crawl_id: current.crawl_id,
                changes,
              },
            )
            totalChanges += changes.length
          }

          previous = current
          lastProcessedCrawlId = current.crawl_id
          processedPairs += 1

          // Limit to prevent timeout - workflow can continue later
          if (processedPairs >= 100) {
            return false
          }
        }
      },
      batchSize: 50,
    })

    console.log('[workflow:detectChanges] complete', {
      processedPairs,
      changesDetected: totalChanges,
      lastProcessedCrawlId,
    })

    return {
      processedPairs,
      changesDetected: totalChanges,
    }
  },
})

// ============================================================================
// DISPATCH ALERTS ACTION
// ============================================================================

/**
 * Dispatch Alerts Action for Workflow
 *
 * Sends Discord notifications for detected changes.
 */
export const dispatchAlerts = internalAction({
  args: {
    crawl_id: v.string(),
  },
  returns: v.object({
    dispatched: v.boolean(),
    subscriptions: v.number(),
    deliveries: v.number(),
  }),
  handler: async (ctx, args) => {
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.log('[workflow:dispatchAlerts] DISCORD_BOT_TOKEN not configured')
      return { dispatched: false, subscriptions: 0, deliveries: 0 }
    }

    const subscriptions = await ctx.runQuery(internal.discord.subscriptions.getActive)
    if (!subscriptions.length) {
      console.log('[workflow:dispatchAlerts] no active subscriptions')
      return { dispatched: false, subscriptions: 0, deliveries: 0 }
    }

    const changes = await ctx.runQuery(internal.alerts.inputs.changesByCrawlId, {
      crawl_id: args.crawl_id,
    })

    if (!changes.length) {
      console.log('[workflow:dispatchAlerts] no changes', { crawl_id: args.crawl_id })
      return { dispatched: false, subscriptions: subscriptions.length, deliveries: 0 }
    }

    // Import the dispatcher logic
    const {
      buildEmbeds,
      buildDeliveries,
      sendDiscordDeliveries,
    } = await import('../alerts/dispatcher')

    const embeds = buildEmbeds(changes)
    const deliveries = buildDeliveries(embeds, subscriptions)

    if (deliveries.length > 0) {
      await sendDiscordDeliveries(deliveries, botToken)
    }

    console.log('[workflow:dispatchAlerts] complete', {
      crawl_id: args.crawl_id,
      subscriptions: subscriptions.length,
      deliveries: deliveries.length,
    })

    return {
      dispatched: deliveries.length > 0,
      subscriptions: subscriptions.length,
      deliveries: deliveries.length,
    }
  },
})
