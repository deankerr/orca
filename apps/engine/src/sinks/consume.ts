// * Sinks queue consumer: windowed batch → process (decode + load + plugins).
// *
// * Failure policy:
// *   maxRetries: 0; always ack the batch
// *   decode / R2 load — fail loud (logged here), still ack; never redrive Work
// *   plugin failures — isolated inside adapt; never fail the bank
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import type { Store } from '../observations/store.ts'
import { processBatch } from './process.ts'
import type { Sink } from './types.ts'

/** Register Sinks consumer. Settings are bank-tuned (independent of Work). */
export const consume = (
  queue: Cloudflare.Queues.Queue,
  deps: { store: Store; sinks: ReadonlyArray<Sink> },
) => {
  const process = processBatch(deps)

  return Cloudflare.Queues.consumeQueueMessages(
    queue,
    {
      batchSize: 25,
      maxConcurrency: 2,
      maxRetries: 0,
      maxWaitTime: '15 seconds',
    },
    (stream) =>
      Stream.runCollect(stream).pipe(
        Effect.flatMap((chunk) => process(chunk)),
        Effect.annotateLogs({ phase: 'sinks' }),
        // * Decode/load defects still ack — do not redrive capture.
        Effect.catchCause((cause) =>
          Effect.logError('sinks: batch failed (acking)').pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause), phase: 'sinks' }),
          ),
        ),
      ),
  )
}
