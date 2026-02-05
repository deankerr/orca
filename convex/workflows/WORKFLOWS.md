# Convex Workflows for ORCA

## Overview

This document describes the prototype implementation of Convex Workflows for ORCA's background task orchestration. The workflow component replaces manual scheduler chaining with **durable workflow execution**.

## Why Workflows?

### Current Architecture Problems

The existing pipeline uses `ctx.scheduler.runAfter()` to chain stages:

```
cron → crawl.run → materialize.run → materializedChanges.run → alerts.dispatcher.run
```

**Issues:**
1. **Lost transitions**: If a function crashes after mutation but before scheduler call, the pipeline breaks
2. **No observability**: Pipeline state is implicit in execution, not queryable
3. **Manual retry**: Each stage handles its own retry logic (or doesn't)
4. **No cancellation**: Once started, pipelines can't be stopped
5. **Debugging difficulty**: Failures require log correlation across multiple function executions

### Workflow Benefits

| Feature | Current | With Workflows |
|---------|---------|----------------|
| Execution guarantee | Best-effort | Durable (survives crashes) |
| State visibility | Logs only | Queryable workflow status |
| Retry behavior | Ad-hoc per function | Configurable exponential backoff |
| Pipeline control | None | Cancel, pause, resume |
| Step history | N/A | Full execution trace |
| Long-running support | Action timeouts | Runs for months |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Manager                          │
│  (convex/workflows/index.ts)                                │
│                                                              │
│  - Global configuration                                      │
│  - Retry policies                                           │
│  - Parallelism limits                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Snapshot Pipeline Workflow                  │
│  (convex/workflows/snapshotPipeline.ts)                     │
│                                                              │
│  main: Orchestrates the complete pipeline                   │
│    ├── stepCrawl: Fetch from OpenRouter APIs                │
│    ├── stepMaterialize: Transform to views                  │
│    ├── stepDetectChanges: Compute diffs                     │
│    └── stepDispatchAlerts: Send Discord notifications       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Workflow Actions                         │
│  (convex/workflows/actions.ts)                              │
│                                                              │
│  Thin wrappers around existing functionality:               │
│  - crawl: API fetching + bundle storage                     │
│  - materialize: View upserts                                │
│  - detectChanges: Diff computation                          │
│  - dispatchAlerts: Discord delivery                         │
└─────────────────────────────────────────────────────────────┘
```

## Files Structure

```
convex/workflows/
├── index.ts              # WorkflowManager instance
├── snapshotPipeline.ts   # Main pipeline workflow definition
├── actions.ts            # Step implementations (actions/mutations)
├── cronTriggers.ts       # Cron integration examples
└── WORKFLOWS.md          # This documentation
```

## Usage

### Starting a Pipeline

```typescript
import { workflow } from './workflows'
import { internal } from './_generated/api'

// From a mutation
export const startPipeline = mutation({
  handler: async (ctx) => {
    const workflowId = await workflow.start(
      ctx,
      internal.workflows.snapshotPipeline.main,
      {
        uptimes: true,
        topApps: false,
        analytics: true,
      }
    )
    return workflowId
  },
})
```

### From Crons

```typescript
// In crons.ts
crons.hourly(
  'workflow-snapshot',
  { minuteUTC: 15 },
  internal.workflows.cronTriggers.snapshotCronMain
)
```

### Manual Testing

```typescript
// From dashboard, run:
internal.workflows.cronTriggers.manualTrigger({
  uptimes: false,
  topApps: false,
  analytics: false,
})
```

## Workflow Definition Pattern

Each workflow step follows this pattern:

```typescript
export const stepName = workflow.define({
  args: { /* validator */ },
  returns: v.object({ /* result shape */ }),
  handler: async (step, args): Promise<ResultType> => {
    // Execute actions/mutations via step runner
    const result = await step.runAction(
      internal.path.to.action,
      args,
      { retry: true }
    )

    return result
  },
})
```

**Key rules:**
1. Always annotate return type explicitly (avoids type cycles)
2. Use `step.runAction()` for network operations with `retry: true`
3. Use `step.runMutation()` for database writes with `retry: false`
4. Workflows must be deterministic - delegate non-deterministic work to actions

## Retry Configuration

### Global Defaults (index.ts)

```typescript
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 1000,
      base: 2,  // Exponential: 1s, 2s, 4s
    },
    retryActionsByDefault: true,
  },
})
```

### Per-Step Override

```typescript
await step.runAction(internal.module.action, args, {
  retry: {
    maxAttempts: 5,
    initialBackoffMs: 500,
    base: 2,
  },
})
```

### Disable Retry

```typescript
await step.runMutation(internal.module.mutation, args, {
  retry: false,  // Don't retry mutations that may have side effects
})
```

## Migration Strategy

### Phase 1: Parallel Deployment
1. Keep existing crons running at :10, :30, :50
2. Add workflow crons at :15, :35, :55
3. Both systems run independently

### Phase 2: Monitoring
1. Compare pipeline completion rates
2. Check log patterns for failures
3. Verify alert delivery consistency

### Phase 3: Cutover
1. Disable old crons
2. Move workflow crons to primary time slots
3. Remove old scheduler-based chaining code

### Rollback Plan
If issues arise:
1. Re-enable old crons
2. Disable workflow crons
3. Investigate via workflow status/history

## Completion Handling

Handle workflow results with `onComplete`:

```typescript
const workflowId = await workflow.start(
  ctx,
  internal.workflows.snapshotPipeline.main,
  args,
  {
    onComplete: internal.workflows.handleComplete,
    context: { startedAt: Date.now() },
  }
)

export const handleComplete = mutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.any(),
  },
  handler: async (ctx, args) => {
    if (args.result.kind === 'success') {
      console.log('Pipeline completed successfully')
    } else if (args.result.kind === 'error') {
      console.error('Pipeline failed:', args.result.error)
      // Could trigger alerts, retry logic, etc.
    }
  },
})
```

## Parallelism Considerations

The workflow component uses a workpool under the hood:

| Tier | Max Parallelism |
|------|-----------------|
| Free | 20 |
| Pro | 100 |

**Recommendation:** Keep `maxParallelism` conservative since ORCA only needs one pipeline at a time. The default is suitable.

## Advanced Patterns

### Parallel Steps

```typescript
const [crawlResult, analyticsResult] = await Promise.all([
  step.runWorkflow(internal.workflows.steps.crawl, {}),
  step.runWorkflow(internal.workflows.steps.analytics, {}),
])
```

### Conditional Steps

```typescript
if (crawlResult.changes > 0) {
  await step.runWorkflow(internal.workflows.steps.alerts, {
    crawl_id: crawlResult.crawl_id,
  })
}
```

### Delayed Execution

```typescript
await step.runMutation(
  internal.module.cleanup,
  { crawl_id },
  { runAfter: 24 * 60 * 60 * 1000 }  // 24 hours
)
```

### Long-Running Workflows

Workflows can sleep for extended periods:

```typescript
// Wait for user confirmation (external event)
await step.awaitEvent({ name: 'userApproved' })

// Or sleep for a fixed duration
await step.sleep(60 * 60 * 1000)  // 1 hour
```

## Debugging

### Check Workflow Status

```typescript
const status = await workflow.status(ctx, workflowId)
// Returns: 'running' | 'completed' | 'failed' | 'canceled'
```

### View Step History

The workflow component stores execution history. Query via dashboard or:

```typescript
const history = await ctx.db
  .query('workflow:stepHistory')
  .filter((q) => q.eq(q.field('workflowId'), workflowId))
  .collect()
```

### Logs

All workflow steps log with prefix `[workflow:*]`:
- `[workflow:pipeline]` - Main pipeline orchestration
- `[workflow:crawl]` - API fetching
- `[workflow:materialize]` - View generation
- `[workflow:detectChanges]` - Diff computation
- `[workflow:dispatchAlerts]` - Discord delivery

## Limitations

1. **Not functional yet**: This is a prototype - imports may need adjustment
2. **Type annotations**: Return types must be explicit to avoid cycles
3. **Determinism required**: Workflows must delegate randomness to actions
4. **Backlog processing**: Changes detection may need multiple workflow runs for large backlogs

## References

- [Convex Workflow Component](https://github.com/get-convex/workflow)
- [Convex Workpool Component](https://www.convex.dev/components/workpool)
- [Durable Workflows Article](https://stack.convex.dev/durable-workflows-and-strong-guarantees)
- [Workflow vs Workpool](https://www.convex.dev/components/workflow)
