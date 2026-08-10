// * One Work message: fetch → store observation → touch entity clocks on success.
// * Returns an outcome so callers outside capture can deliver without capture knowing them.
// * Entity DB failures never redelivery-loop a good observation.
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import type { Detected } from './detected.ts'
import { endpointIds } from './identity.ts'
import * as Key from './key.ts'
import * as OpenRouter from './openrouter.ts'
import type { Store } from './store.ts'
import type { WorkMessage } from './work-message.ts'

/** Result of one capture attempt after archive write. */
export type ProcessResult = {
  readonly status: number
  readonly scopeKey: string
  /**
   * True when status is 200 and at least one endpoint id was parsed.
   * `body` is then safe to hand to product delivery.
   */
  readonly observed: boolean
  /** Upstream body; only meaningful for product delivery when `observed`. */
  readonly body: string
}

export const processWork = (deps: { store: Store; detected: Detected }) =>
  Effect.fn(function* processWork(work: WorkMessage) {
    const captured = yield* OpenRouter.endpoints(work)
    const now = yield* DateTime.now
    const observedAt = Key.observedAtKey(now)
    const scopeKey = Key.scopeKey(work.permaslug, work.variant)

    yield* deps.store.putObservation({
      body: captured.body,
      observedAt,
      permaslug: work.permaslug,
      scopeKey,
      status: captured.status,
      variant: work.variant,
    })

    if (captured.status !== 200) {
      yield* Effect.logWarning('capture: non-200 observation').pipe(
        Effect.annotateLogs({
          body: captured.body,
          phase: 'capture',
          scope: scopeKey,
          status: String(captured.status),
        }),
      )
      return {
        body: captured.body,
        observed: false,
        scopeKey,
        status: captured.status,
      }
    }

    const ids = endpointIds(captured.body)
    if (ids === null) {
      yield* Effect.logWarning('capture: no endpoint ids in 200 body').pipe(
        Effect.annotateLogs({
          body: captured.body,
          phase: 'capture',
          scope: scopeKey,
          status: String(captured.status),
        }),
      )
      return {
        body: captured.body,
        observed: false,
        scopeKey,
        status: captured.status,
      }
    }

    const at = DateTime.formatIso(now)
    yield* deps.detected.record({ at, endpointIds: ids, scopeKey }).pipe(
      Effect.tapCause((cause) =>
        Effect.logWarning('capture: detected record failed').pipe(
          Effect.annotateLogs({
            cause: Cause.pretty(cause),
            endpoints: String(ids.length),
            phase: 'capture',
            scope: scopeKey,
          }),
        ),
      ),
      Effect.catchCause(() => Effect.void),
    )

    return {
      body: captured.body,
      observed: true,
      scopeKey,
      status: captured.status,
    }
  })
