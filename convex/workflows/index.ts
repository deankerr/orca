/**
 * Convex Workflow Manager
 *
 * Central workflow manager for ORCA's background task orchestration.
 * This replaces manual scheduler chaining with durable workflow execution.
 *
 * Benefits over current approach:
 * - Guaranteed pipeline progression (no lost scheduler calls between mutations)
 * - Observable workflow state and history
 * - Built-in retry with exponential backoff
 * - Survives server restarts
 * - Cancellation support
 */
import { WorkflowManager } from '@convex-dev/workflow'

import { components } from '../_generated/api'

/**
 * Global workflow manager instance
 *
 * Configuration:
 * - maxParallelism: Stay under 20 (free tier) or 100 (Pro) across all workflows
 * - defaultRetryBehavior: Exponential backoff for transient failures
 * - retryActionsByDefault: true for network operations (API fetches)
 */
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 1000,
      base: 2,
    },
    // Actions (API calls) should retry by default
    retryActionsByDefault: true,
  },
})
