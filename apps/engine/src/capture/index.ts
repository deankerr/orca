// * Capture pipeline: full sample → CaptureQueue → archive + entity clocks → SinksQueue.
// *
// * Public interface only. OpenRouter, Message, Sample, Consume are implementation.
import type * as Cloudflare from 'alchemy/Cloudflare'

import type { EntityClocks } from '../entities/index.ts'
import type { ObservationStore } from '../observations/index.ts'
import * as Consume from './Consume.ts'
import * as Sample from './Sample.ts'

export { start as startFullSample } from './FullSample.ts'

/** Wire the CaptureQueue consumer (sample + enqueue ObservationRef). */
export const wire = (deps: {
  queue: Cloudflare.Queues.Queue
  observationStore: ObservationStore
  entityClocks: EntityClocks
  sinksQueueWriter: Cloudflare.Queues.WriteQueueClient
}) => {
  const sampleScope = Sample.make({
    entityClocks: deps.entityClocks,
    observationStore: deps.observationStore,
  })
  return Consume.register(deps.queue, {
    sampleScope,
    sinksQueueWriter: deps.sinksQueueWriter,
  })
}
