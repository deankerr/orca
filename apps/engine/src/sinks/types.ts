// * Sink plugins: product projections over banked raw observations.
import type * as Effect from 'effect/Effect'

/** One archived observation, body already loaded from Observations. */
export type ObservationItem = {
  readonly observedAt: string
  readonly scopeKey: string
  readonly body: string
}

/**
 * Product plugin over a resolved batch of raw archive bodies.
 *
 * - `name` — stable id for logs / fan-out isolation
 * - `receive` — product work; may fail with any typed error (`E`).
 *   The bus adapter erases failures so one plugin never fails the bank
 *   or redrives capture Work.
 *
 * Wire with `make(deps): Sink` (or `Sink<YourError>`) and pass into the
 * Sinks consumer list. Keep product decode and external I/O private.
 */
export type Sink<E = unknown> = {
  readonly name: string
  readonly receive: (batch: ReadonlyArray<ObservationItem>) => Effect.Effect<void, E>
}
