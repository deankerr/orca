// * Work queue consumer: capture only; enqueue ObservationRef on success.
// *
// * Failure policy:
// *   decode / capture / R2 / sink enqueue — fail the message (queue retries)
// *   entities (detected) — best-effort inside processWork
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { fromBinding } from '../binding.ts'
import { decodeWorkMessage } from './message.ts'
import type { WorkMessage } from './message.ts'
import type { ProcessResult } from './process.ts'

/** Register Work consumer. Settings are capture-tuned (independent of Sinks). */
export const consume = (
  queue: Cloudflare.Queues.Queue,
  deps: {
    capture: (work: WorkMessage) => Effect.Effect<ProcessResult, unknown>
    sinksQueue: Cloudflare.Queues.WriteQueueClient
  },
) => {
  const handle = Effect.fn(function* onWorkMessage(message: unknown) {
    const workMessage = yield* decodeWorkMessage(message)
    const result = yield* deps.capture(workMessage)

    if (!result.observed) {
      return
    }

    yield* fromBinding(
      deps.sinksQueue.send({
        observedAt: result.observedAt,
        scopeKey: result.scopeKey,
      }),
    )
  })

  return Cloudflare.Queues.consumeQueueMessages(
    queue,
    { batchSize: 1, maxConcurrency: 4, maxRetries: 3 },
    (stream) =>
      Stream.runForEach(stream, (message) =>
        handle(message.body).pipe(
          Effect.annotateLogs({ phase: 'work' }),
          Effect.tapCause((cause) =>
            Effect.logError('work: message failed').pipe(
              Effect.annotateLogs({
                cause: Cause.pretty(cause),
                phase: 'work',
              }),
            ),
          ),
        ),
      ),
  )
}
