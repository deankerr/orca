// * Capture pipeline: full sample → CaptureQueue → archive + entity clocks → SinksQueue.
// *
// * Public interface only. OpenRouter, Message, Sample, Consume are implementation.
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

import type { EntityClocks } from '../entities/index.ts'
import * as Consume from './Consume.ts'
import * as Sample from './Sample.ts'

export { make as makeFullSample } from './FullSample.ts'
export { OpenRouterClient } from './OpenRouter.ts'

/** Wire the CaptureQueue consumer (sample + enqueue ObservationRef). */
export const wire = (deps: {
  queue: Cloudflare.Queues.Queue
  entityClocks: EntityClocks
  sinksQueueWriter: Cloudflare.Queues.WriteQueueClient
}) =>
  Effect.gen(function* wireCapture() {
    const sampleScope = yield* Sample.make({
      entityClocks: deps.entityClocks,
    })
    return yield* Consume.register(deps.queue, {
      sampleScope,
      sinksQueueWriter: deps.sinksQueueWriter,
    })
  })
