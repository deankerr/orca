// * Port: product plugin over banked raw observations.
// * Real seam — multiple adapters (convex-current, public-api, …).
import type * as Effect from 'effect/Effect'

/** One archived observation, body already loaded from the archive. */
export type ObservationItem = {
  readonly observedAt: string
  readonly scopeKey: string
  readonly body: string
}

/**
 * Product plugin. Adapters implement this; the bus never sees product internals.
 *
 * - `name` — stable id for logs / fan-out isolation
 * - `receive` — product work; may fail with any typed error (`E`).
 *   The bank isolates failures so one plugin never fails the batch
 *   or redrives CaptureQueue.
 *
 * Implement with `make(deps): Sink` in a product module; pass into Sinks.wire.
 */
export type Sink<E = unknown> = {
  readonly name: string
  readonly receive: (batch: ReadonlyArray<ObservationItem>) => Effect.Effect<void, E>
}
