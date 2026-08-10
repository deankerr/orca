// * One queue message: fetch → archive (required) → current cache (best-effort).
// * Later: prior → planTransition → deliver plugs in after archive, before or after put.
import type { EndpointsQuery } from '@orca/schema/artifacts.ts'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import type { Archive } from '../archive/store.ts'
import type { Current } from '../current/cache.ts'
import * as Scope from '../current/observation.ts'
import * as OpenRouter from '../openrouter/client.ts'

export const processMessage = (deps: { archive: Archive; current: Current }) =>
  Effect.fn(function* processMessage(query: EndpointsQuery) {
    const observed = yield* OpenRouter.endpoints(query)
    yield* deps.archive.putEndpoints({ ...observed, query })

    if (observed.status !== 200) {
      return
    }

    const next = Scope.parseEndpointsBody(observed.body)
    if (next === null) {
      return
    }

    const key = Scope.encodeScopeKey(query.permaslug, query.variant)
    const updatedAt = DateTime.formatIso(yield* DateTime.now)

    // * Must not redelivery-loop a good observation when D1 is unhappy.
    yield* deps.current
      .put({
        key,
        observation: next,
        observedBatch: query.batch,
        updatedAt,
      })
      .pipe(
        Effect.tapCause((cause) =>
          Effect.logWarning('current-cache put failed', {
            cause,
            endpoints: next.endpoints.length,
            permaslug: query.permaslug,
            variant: query.variant,
          }),
        ),
        Effect.catchCause(() => Effect.void),
      )
  })
