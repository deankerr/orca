// * CaptureQueue consumer: sample one scope; enqueue ObservationRef on success.
// *
// * Failure policy:
// *   decode / capture / R2 / sink enqueue — fail the message (queue retries)
// *   entity clocks — best-effort inside Sample
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { fromBinding } from '../binding.ts'
import { withAppLogger } from '../logging.ts'
import { decodeCaptureJob } from './Message.ts'
import type { CaptureJob } from './Message.ts'
import type { SampleResult } from './Sample.ts'

/** Register CaptureQueue consumer. */
export const register = (
  queue: Cloudflare.Queues.Queue,
  deps: {
    // Port: sample may fail with Schema/R2/transport defects we don't branch on
    // here — any failure fails the message and CF retries. Opaque `unknown` keeps
    // the consumer free of Sample's full error graph; Cause.pretty logs the rest.
    // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context
    sampleScope: (job: CaptureJob) => Effect.Effect<SampleResult, unknown>
    sinksQueueWriter: Cloudflare.Queues.WriteQueueClient
  },
) => {
  const handle = Effect.fn(function* onCaptureJob(message: unknown) {
    const job = yield* decodeCaptureJob(message)
    // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- sampleScope port (see deps)
    const result = yield* deps.sampleScope(job)

    if (!result.observed) {
      return
    }

    yield* fromBinding(
      deps.sinksQueueWriter.send({
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
        withAppLogger(
          // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- handle inherits sampleScope port
          handle(message.body).pipe(
            Effect.annotateLogs({ phase: 'capture' }),
            Effect.tapCause((cause) =>
              Effect.logError('capture: message failed').pipe(
                Effect.annotateLogs({
                  cause: Cause.pretty(cause),
                  phase: 'capture',
                }),
              ),
            ),
          ),
        ),
      ),
  )
}
