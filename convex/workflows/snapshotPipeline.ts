/**
 * Snapshot Pipeline Workflow
 *
 * Orchestrates the complete data pipeline from crawl to alerts:
 *
 *   Crawl → Materialize → Changes Detection → Alerts Dispatch
 *
 * This workflow replaces the current manual scheduler chaining with
 * durable execution that survives failures and provides observability.
 *
 * MIGRATION PATH:
 * 1. Deploy workflow alongside existing crons
 * 2. Create parallel cron entries that use workflows
 * 3. Monitor both approaches
 * 4. Disable old crons once confident
 *
 * KEY DIFFERENCES FROM CURRENT APPROACH:
 * - State is tracked in workflow, not implicit in function execution
 * - Failures retry automatically with exponential backoff
 * - Each step's result is persisted, enabling resume on crash
 * - Pipeline can be cancelled and monitored via dashboard
 */
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import type { CrawlArchiveBundle } from '../snapshots/crawl/main'
import { workflow } from './index'

/**
 * Crawl Configuration Args
 *
 * Matches existing crawl.main.run args
 */
const vCrawlConfig = v.object({
  uptimes: v.boolean(),
  topApps: v.boolean(),
  analytics: v.boolean(),
})

/**
 * Workflow Result Type
 *
 * Summary of what happened during the pipeline run
 */
type PipelineResult = {
  crawl_id: string
  totals: {
    models: number
    endpoints: number
    providers: number
    uptimes: number
    analytics: number
  }
  changes: {
    processed: number
    created: number
    updated: number
    deleted: number
  }
  alerts: {
    dispatched: boolean
    subscriptions: number
  }
}

// ============================================================================
// STEP FUNCTIONS
// ============================================================================
// These are the individual functions that the workflow orchestrates.
// Each is an internal action/mutation that can be called as a workflow step.

/**
 * Step 1: Crawl OpenRouter APIs
 *
 * Fetches models, endpoints, providers, and optional data (uptimes, analytics).
 * Returns the crawl_id for subsequent steps.
 *
 * This step is an ACTION because it makes external HTTP requests.
 */
export const stepCrawl = workflow.define({
  args: vCrawlConfig,
  // NOTE: Always annotate return types to avoid type cycles
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
  handler: async (step, args): Promise<{
    crawl_id: string
    totals: {
      models: number
      endpoints: number
      providers: number
      uptimes: number
      analytics: number
    }
  }> => {
    // Execute the crawl action - this makes HTTP requests and stores the bundle
    // Using retry:true because this is a network operation
    const result = await step.runAction(
      internal.workflows.actions.crawl,
      args,
      { retry: true },
    )

    return result
  },
})

/**
 * Step 2: Materialize Views
 *
 * Transforms the raw crawl bundle into normalized views.
 * Creates/updates models, endpoints, providers in view tables.
 *
 * This step is a MUTATION because it modifies the database.
 */
export const stepMaterialize = workflow.define({
  args: { crawl_id: v.string() },
  returns: v.object({
    models: v.number(),
    endpoints: v.number(),
    providers: v.number(),
  }),
  handler: async (step, args): Promise<{
    models: number
    endpoints: number
    providers: number
  }> => {
    // Materialize is an action that calls mutations internally
    const result = await step.runAction(
      internal.workflows.actions.materialize,
      { crawl_id: args.crawl_id },
      { retry: false }, // Don't retry mutations to avoid duplicates
    )

    return result
  },
})

/**
 * Step 3: Detect Changes
 *
 * Compares the current snapshot with the previous one.
 * Outputs field-level diffs to the changes table.
 *
 * This is a potentially long-running step if backlog exists.
 * The workflow will wait for completion before proceeding.
 */
export const stepDetectChanges = workflow.define({
  args: {
    crawl_id: v.string(),
    fromCrawlId: v.optional(v.string()),
  },
  returns: v.object({
    processedPairs: v.number(),
    changesDetected: v.number(),
  }),
  handler: async (step, args): Promise<{
    processedPairs: number
    changesDetected: number
  }> => {
    const result = await step.runAction(
      internal.workflows.actions.detectChanges,
      {
        crawl_id: args.crawl_id,
        fromCrawlId: args.fromCrawlId,
      },
      { retry: false },
    )

    return result
  },
})

/**
 * Step 4: Dispatch Alerts
 *
 * Sends Discord notifications for detected changes.
 * Matches changes against subscriptions and delivers embeds.
 */
export const stepDispatchAlerts = workflow.define({
  args: { crawl_id: v.string() },
  returns: v.object({
    dispatched: v.boolean(),
    subscriptions: v.number(),
    deliveries: v.number(),
  }),
  handler: async (step, args): Promise<{
    dispatched: boolean
    subscriptions: number
    deliveries: number
  }> => {
    const result = await step.runAction(
      internal.workflows.actions.dispatchAlerts,
      { crawl_id: args.crawl_id },
      { retry: true }, // Retry Discord API calls
    )

    return result
  },
})

// ============================================================================
// MAIN PIPELINE WORKFLOW
// ============================================================================

/**
 * Main Snapshot Pipeline Workflow
 *
 * Orchestrates the complete data pipeline:
 * 1. Crawl - Fetch data from OpenRouter APIs
 * 2. Materialize - Transform into views
 * 3. Detect Changes - Compare with previous snapshot
 * 4. Dispatch Alerts - Send notifications
 *
 * Usage:
 * ```ts
 * const workflowId = await workflow.start(
 *   ctx,
 *   internal.workflows.snapshotPipeline.main,
 *   { uptimes: true, topApps: false, analytics: false }
 * )
 * ```
 */
export const main = workflow.define({
  args: vCrawlConfig,
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    // Step 1: Crawl
    const crawlResult = await step.runWorkflow(
      internal.workflows.snapshotPipeline.stepCrawl,
      args,
    )

    const { crawl_id, totals } = crawlResult
    console.log('[workflow:pipeline] crawl complete', { crawl_id, totals })

    // Step 2: Materialize
    const materializeResult = await step.runWorkflow(
      internal.workflows.snapshotPipeline.stepMaterialize,
      { crawl_id },
    )

    console.log('[workflow:pipeline] materialize complete', {
      crawl_id,
      ...materializeResult,
    })

    // Step 3: Detect Changes
    const changesResult = await step.runWorkflow(
      internal.workflows.snapshotPipeline.stepDetectChanges,
      { crawl_id },
    )

    console.log('[workflow:pipeline] changes detection complete', {
      crawl_id,
      ...changesResult,
    })

    // Step 4: Dispatch Alerts (only if changes were detected)
    if (changesResult.changesDetected > 0) {
      const alertsResult = await step.runWorkflow(
        internal.workflows.snapshotPipeline.stepDispatchAlerts,
        { crawl_id },
      )

      console.log('[workflow:pipeline] alerts dispatched', {
        crawl_id,
        ...alertsResult,
      })
    } else {
      console.log('[workflow:pipeline] no changes, skipping alerts')
    }

    console.log('[workflow:pipeline] complete', { crawl_id })
    return null
  },
})

// ============================================================================
// LITE PIPELINE (Core data only)
// ============================================================================

/**
 * Lite Pipeline - Core data only
 *
 * Runs the pipeline without uptimes, topApps, or analytics.
 * Used for the :10 and :50 minute cron runs.
 */
export const lite = workflow.define({
  args: {},
  returns: v.null(),
  handler: async (step): Promise<null> => {
    await step.runWorkflow(internal.workflows.snapshotPipeline.main, {
      uptimes: false,
      topApps: false,
      analytics: false,
    })

    return null
  },
})

// ============================================================================
// SCHEDULED WORKFLOW TRIGGERS
// ============================================================================

/**
 * Start a pipeline workflow (called from crons)
 *
 * This mutation starts the workflow and returns immediately.
 * The workflow runs asynchronously in the background.
 */
import { internalMutation } from '../_generated/server'

export const startPipeline = internalMutation({
  args: vCrawlConfig,
  handler: async (ctx, args) => {
    const cfg = await ctx.db.query('snapshot_crawl_config').first()
    if (!cfg?.enabled) {
      console.log('[workflow:startPipeline] snapshots disabled')
      return null
    }

    const workflowId = await workflow.start(
      ctx,
      internal.workflows.snapshotPipeline.main,
      args,
    )

    console.log('[workflow:startPipeline] started', { workflowId, args })
    return workflowId
  },
})

/**
 * Start the lite pipeline (called from crons)
 */
export const startLitePipeline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.db.query('snapshot_crawl_config').first()
    if (!cfg?.enabled) {
      console.log('[workflow:startLitePipeline] snapshots disabled')
      return null
    }

    const workflowId = await workflow.start(
      ctx,
      internal.workflows.snapshotPipeline.lite,
      {},
    )

    console.log('[workflow:startLitePipeline] started', { workflowId })
    return workflowId
  },
})
