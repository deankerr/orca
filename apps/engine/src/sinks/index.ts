// * Sinks bus: windowed ObservationRef batch → load once → fan-out product plugins.
// *
// * Public interface: wire + Sink port. Bank, Consume are implementation.
// * Product adapters live in sibling folders and implement Sink.
import type * as Cloudflare from 'alchemy/Cloudflare'

import type { ObservationStore } from '../observations/index.ts'
import * as Consume from './Consume.ts'
import type { Sink } from './Sink.ts'

export type { ObservationItem, Sink } from './Sink.ts'

/** Wire the SinksQueue consumer (bank + product fan-out). */
export const wire = (deps: {
  queue: Cloudflare.Queues.Queue
  observationStore: ObservationStore
  sinks: ReadonlyArray<Sink>
}) =>
  Consume.register(deps.queue, {
    observationStore: deps.observationStore,
    sinks: deps.sinks,
  })
