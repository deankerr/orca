/**
 * Workflow-based Cron Triggers
 *
 * This module shows how to update the existing crons to use workflows.
 *
 * MIGRATION STRATEGY:
 * 1. Keep existing crons running (crons.ts)
 * 2. Add new workflow-based crons at different minute offsets
 * 3. Monitor both approaches via logs
 * 4. Once confident, disable old crons
 *
 * EXAMPLE: To add workflow crons to crons.ts:
 * ```ts
 * // Add after existing cron definitions:
 * crons.hourly('workflow-snapshot-15', { minuteUTC: 15 }, internal.workflows.cronTriggers.snapshotCronLite)
 * crons.hourly('workflow-snapshot-35', { minuteUTC: 35 }, internal.workflows.cronTriggers.snapshotCronMain)
 * crons.hourly('workflow-snapshot-55', { minuteUTC: 55 }, internal.workflows.cronTriggers.snapshotCronLite)
 * ```
 */
import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'
import { workflow } from './index'

/**
 * Workflow-based Lite Cron
 *
 * Equivalent to snapshotCronLite but using durable workflows.
 * Fetches core data only (models, endpoints, providers).
 */
export const snapshotCronLite = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.runQuery(internal.config.getFirst)
    if (!cfg?.enabled) {
      console.log('[workflow:cron:lite] snapshots disabled')
      return
    }

    // Start the workflow - it will execute durably in the background
    const workflowId = await ctx.runMutation(
      internal.workflows.snapshotPipeline.startPipeline,
      {
        uptimes: false,
        topApps: false,
        analytics: false,
      },
    )

    console.log('[workflow:cron:lite] pipeline started', { workflowId })
  },
})

/**
 * Workflow-based Main Cron
 *
 * Equivalent to snapshotCronMain but using durable workflows.
 * Includes extras (uptimes, topApps, analytics) based on hourly config.
 */
export const snapshotCronMain = internalAction({
  args: {},
  handler: async (ctx) => {
    const cfg = await ctx.runQuery(internal.config.getFirst)
    if (!cfg?.enabled) {
      console.log('[workflow:cron:main] snapshots disabled')
      return
    }

    const h = new Date().getUTCHours()
    const on = (every: number) => every > 0 && h % every === 0

    const args = {
      uptimes: on(cfg.uptimes_every_hours),
      topApps: on(cfg.topApps_every_hours ?? 0),
      analytics: on(cfg.analytics_every_hours ?? 0),
    }

    const workflowId = await ctx.runMutation(
      internal.workflows.snapshotPipeline.startPipeline,
      args,
    )

    console.log('[workflow:cron:main] pipeline started', { workflowId, args })
  },
})

// ============================================================================
// WORKFLOW STATUS QUERIES
// ============================================================================

/**
 * Get Workflow Status
 *
 * Query the status of a running workflow.
 * Useful for monitoring and debugging.
 */
export const getWorkflowStatus = internalAction({
  args: {
    workflowId: v.string(),
  },
  handler: async (ctx, args) => {
    // Workflow status is stored in the component's internal tables
    // This is a placeholder - actual implementation depends on workflow component API
    console.log('[workflow:status] checking', { workflowId: args.workflowId })

    // The workflow component provides status via subscription
    // See: workflow.status(ctx, workflowId)
    return { workflowId: args.workflowId, status: 'unknown' }
  },
})

// ============================================================================
// MANUAL TRIGGER FOR TESTING
// ============================================================================

/**
 * Manual Pipeline Trigger
 *
 * For testing workflows from the dashboard.
 */
export const manualTrigger = internalMutation({
  args: {
    uptimes: v.optional(v.boolean()),
    topApps: v.optional(v.boolean()),
    analytics: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.snapshotPipeline.main,
      {
        uptimes: args.uptimes ?? false,
        topApps: args.topApps ?? false,
        analytics: args.analytics ?? false,
      },
    )

    console.log('[workflow:manual] pipeline started', {
      workflowId,
      args,
    })

    return workflowId
  },
})
