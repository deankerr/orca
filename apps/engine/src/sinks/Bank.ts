// * One sinks bank: decode refs → load archive once → run plugins.
// * Decode/load fail loud (we enqueued these). Plugin failures stay isolated.
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { ObservationRef } from '../observations/index.ts'
import type { ObservationStore } from '../observations/index.ts'
import type { ObservationItem, Sink } from './Sink.ts'

const decodeRefs = Schema.decodeUnknownEffect(Schema.Array(ObservationRef))

/** Run one plugin; log failures; never fail the Effect (or the bank). */
const receiveIsolated = (sink: Sink) => (batch: ReadonlyArray<ObservationItem>) =>
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
    Effect.ignoreCause,
  )

/** Process one windowed batch of SinksQueue messages. */
export const processBatch = (deps: {
  observationStore: ObservationStore
  sinks: ReadonlyArray<Sink>
}) =>
  Effect.fn(function* processBatch(messages: ReadonlyArray<{ body: unknown }>) {
    const refs = yield* decodeRefs(messages.map((message) => message.body))

    // Parallel R2 gets — bank size is small (≤ queue batchSize).
    const items: ObservationItem[] = yield* Effect.forEach(
      refs,
      (ref) =>
        deps.observationStore.getObservation(ref).pipe(
          Effect.map((body) => ({
            body,
            observedAt: ref.observedAt,
            scopeKey: ref.scopeKey,
          })),
        ),
      { concurrency: 'unbounded' },
    )

    // Independent product I/O — concurrent; each plugin isolated.
    yield* Effect.forEach(deps.sinks, (sink) => receiveIsolated(sink)(items), {
      concurrency: 'unbounded',
      discard: true,
    })
  })
