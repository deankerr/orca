// * Capture composition: one Work message → archive + entity clocks.
// * Policy: archive only validated 200 data; observed when ≥1 non-empty endpoint id.
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import * as Key from '../observations/key.ts'
import type { Store } from '../observations/store.ts'
import type { Detected } from './detected.ts'
import type { WorkMessage } from './message.ts'
import * as OpenRouter from './openrouter.ts'

/** Result of one capture attempt after (optional) archive write. */
export type ProcessResult = {
  readonly observedAt: string
  readonly scopeKey: string
  /** True when status is 200 and at least one endpoint id was present. */
  readonly observed: boolean
}

export const processWork = (deps: { store: Store; detected: Detected }) =>
  Effect.fn(function* processWork(work: WorkMessage) {
    const captured = yield* OpenRouter.fetchEndpoints(work)
    const now = yield* DateTime.now
    const observedAt = work.observedAt ?? Key.observedAtKey(now)
    const scopeKey = Key.scopeKey(work.permaslug, work.variant)

    if (captured._tag === 'HttpError') {
      yield* Effect.logWarning('capture: non-200 observation').pipe(
        Effect.annotateLogs({
          body: captured.body,
          phase: 'capture',
          scope: scopeKey,
          status: String(captured.status),
        }),
      )
      return {
        observed: false,
        observedAt,
        scopeKey,
      }
    }

    // Persist only the validated success envelope.
    const body = JSON.stringify({ data: captured.data })
    yield* deps.store.putObservation({
      body,
      observedAt,
      permaslug: work.permaslug,
      scopeKey,
      status: captured.status,
      variant: work.variant,
    })

    const ids = captured.data.map((row) => row.id).filter((id) => id.length > 0)
    if (ids.length === 0) {
      yield* Effect.logWarning('capture: no endpoint ids in 200 body').pipe(
        Effect.annotateLogs({
          body,
          phase: 'capture',
          scope: scopeKey,
          status: String(captured.status),
        }),
      )
      return {
        observed: false,
        observedAt,
        scopeKey,
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
      observed: true,
      observedAt,
      scopeKey,
    }
  })
