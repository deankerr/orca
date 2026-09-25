import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../../_generated/server'
import type { LoadedScanPair } from '../scan'
import type { Execution, ObservationPair } from './step'
import type { Ingestion } from './table'

type Step = {
  name: string
  process: (ctx: ActionCtx, observations: ObservationPair, execution: Execution) => Promise<void>
}

/** Bind observations and checkpoints without deriving output until a processor executes. */
export function remainingSteps(
  steps: readonly Step[],
  ingestion: Ingestion,
  observations: LoadedScanPair,
) {
  function bind(stage: 'baseline' | 'forward', pair: ObservationPair) {
    return steps.map((step) => ({
      process: step.process,
      observations: pair,
      execution: {
        ingestionId: ingestion.id,
        checkpoint: {
          phase: `${stage}_${step.name}`,
          status: stage === 'forward' && step === steps.at(-1) ? 'complete' : 'running',
        },
      } satisfies Execution,
    }))
  }

  const plan = [
    ...(ingestion.baseline
      ? bind('baseline', { previous: null, next: observations.previous })
      : []),
    ...bind('forward', observations),
  ]
  if (ingestion.phase === 'initial') {
    return plan
  }

  const completed = plan.findIndex((step) => step.execution.checkpoint.phase === ingestion.phase)
  if (completed === -1) {
    throw new ConvexError({ message: 'Unknown completed checkpoint', phase: ingestion.phase })
  }
  return plan.slice(completed + 1)
}
