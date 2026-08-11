// * One Sinks bank: decode refs → load archive once → run plugins (adapted).
// * Internal steps (decode, load) fail loud — we enqueue these messages ourselves.
// * Plugin failures are isolated by adapt; they never fail the bank.
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { ObservationRef } from '../observations/ref.ts'
import type { Store } from '../observations/store.ts'
import { adapt } from './adapt.ts'
import type { ObservationItem, Sink } from './types.ts'

const decodeRefs = Schema.decodeUnknownEffect(Schema.Array(ObservationRef))

/** Process one windowed batch of Sinks queue messages. */
export const processBatch = (deps: { store: Store; sinks: ReadonlyArray<Sink> }) =>
  Effect.fn(function* processBatch(messages: ReadonlyArray<{ body: unknown }>) {
    const refs = yield* decodeRefs(messages.map((message) => message.body))

    // Parallel R2 gets — bank size is small (≤ queue batchSize).
    const items: ObservationItem[] = yield* Effect.forEach(
      refs,
      (ref) =>
        deps.store.getObservation(ref).pipe(
          Effect.map((body) => ({
            body,
            observedAt: ref.observedAt,
            scopeKey: ref.scopeKey,
          })),
        ),
      { concurrency: 'unbounded' },
    )

    // Independent product I/O — run plugins concurrently; adapt isolates each.
    yield* Effect.forEach(deps.sinks, (sink) => adapt(sink)(items), {
      concurrency: 'unbounded',
      discard: true,
    })
  })
