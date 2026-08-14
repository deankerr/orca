// * Port for the immutable raw observation archive.
// * RuntimeContext is intentional: archive I/O may only run inside a deployed handler.
import type { RuntimeContext } from 'alchemy'
import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { ObservationArchiveError } from './ArchiveError.ts'
import type { ObservationRef } from './Ref.ts'

export type PutObservation = {
  readonly observedAt: string
  readonly scopeKey: string
  readonly permaslug: string
  readonly variant: string
  readonly status: number
  /** Validated success envelope JSON (`{ data: [...] }`). */
  readonly body: string
}

export type PutCatalog = {
  readonly observedAt: string
  readonly body: string
}

// oxlint-disable-next-line jsdoc/check-tag-names -- recognized by effect-tsgo; Alchemy intentionally exposes RuntimeContext
/** @effect-expect-leaking RuntimeContext */
export class ObservationArchive extends Context.Service<
  ObservationArchive,
  {
    /** Store one endpoints observation under its existing temporal R2 key. */
    readonly putObservation: (
      observation: PutObservation,
    ) => Effect.Effect<void, ObservationArchiveError, RuntimeContext>

    /** Read one endpoints observation body (gunzipped JSON text) by ref. */
    readonly getObservation: (
      ref: ObservationRef,
    ) => Effect.Effect<string, ObservationArchiveError, RuntimeContext>

    /** Store one catalog inventory under its existing temporal R2 key. */
    readonly putCatalog: (
      catalog: PutCatalog,
    ) => Effect.Effect<void, ObservationArchiveError, RuntimeContext>
  }
>()('engine/observations/ObservationArchive') {}
