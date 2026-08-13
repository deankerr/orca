// * SinksQueue consumer: windowed batch → bank.
// *
// * Failure policy:
// *   maxRetries: 0; always ack the batch
// *   decode / R2 load — fail loud (logged here), still ack; never redrive CaptureQueue
// *   plugin failures — isolated inside the bank; never fail the batch
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { withAppLogger } from '../logging.ts'
import type { ObservationStore } from '../observations/index.ts'
import { processBatch } from './Bank.ts'
import type { Sink } from './Sink.ts'

/** Register SinksQueue consumer. */
export const register = (
  queue: Cloudflare.Queues.Queue,
  deps: { observationStore: ObservationStore; sinks: ReadonlyArray<Sink> },
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
      withAppLogger(
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
      ),
  )
}
