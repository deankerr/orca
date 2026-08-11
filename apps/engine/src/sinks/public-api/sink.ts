// * Public API projection sink (scaffold).
// * Receives raw observation batches; no-op until transform + blob materialize land.
// * Near-term: move to a package that exports make(deps): Sink — same contract.
import * as Effect from 'effect/Effect'

import type { Sink } from '../types.ts'

/** Scaffold: log batch size. Replace with ingest + debounced V2 materialize. */
export const make = (): Sink => ({
  name: 'public-api',
  receive: (batch) =>
    Effect.log('public-api: received batch').pipe(
      Effect.annotateLogs({
        observations: String(batch.length),
        phase: 'public-api',
        sink: 'public-api',
      }),
    ),
})
