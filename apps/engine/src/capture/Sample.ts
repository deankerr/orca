// * One CaptureJob → archive + entity clocks.
// * Policy: archive only validated 200 data; observed when ≥1 non-empty endpoint id.
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import type { EntityClocks } from '../entities/index.ts'
import * as Observations from '../observations/index.ts'
import type { ObservationStore } from '../observations/index.ts'
import type { CaptureJob } from './Message.ts'
import * as OpenRouter from './OpenRouter.ts'

/** Result of one capture attempt after (optional) archive write. */
export type SampleResult = {
  readonly observedAt: string
  readonly scopeKey: string
  /** True when status is 200 and at least one endpoint id was present. */
  readonly observed: boolean
}

export const make = (deps: { observationStore: ObservationStore; entityClocks: EntityClocks }) =>
  Effect.fn(function* sampleScope(job: CaptureJob) {
    const captured = yield* OpenRouter.fetchEndpoints(job)
    const now = yield* DateTime.now
    const observedAt = job.observedAt ?? Observations.observedAtKey(now)
    const scopeKey = Observations.scopeKey(job.permaslug, job.variant)

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
    yield* deps.observationStore.putObservation({
      body,
      observedAt,
      permaslug: job.permaslug,
      scopeKey,
      status: captured.status,
      variant: job.variant,
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
    yield* deps.entityClocks.record({ at, endpointIds: ids, scopeKey }).pipe(
      Effect.tapCause((cause) =>
        Effect.logWarning('capture: entity clocks failed').pipe(
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
