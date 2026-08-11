// * Safe plugin adapter: isolate sink failures so the bank always completes.
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'

import type { ObservationItem, Sink } from './types.ts'

/**
 * Run one sink against a batch. Logs failures with Cause; never fails the Effect.
 * Product errors must not fail the Sinks bank or redrive capture Work.
 */
export const adapt = (sink: Sink) => (batch: ReadonlyArray<ObservationItem>) =>
  sink.receive(batch).pipe(
    Effect.annotateLogs({
      observations: String(batch.length),
      phase: 'sinks',
      sink: sink.name,
    }),
    Effect.tapCause((cause) =>
      Effect.logWarning('sinks: plugin failed').pipe(
        Effect.annotateLogs({
          cause: Cause.pretty(cause),
          observations: String(batch.length),
          phase: 'sinks',
          sink: sink.name,
        }),
      ),
    ),
    Effect.catchCause(() => Effect.void),
  )
