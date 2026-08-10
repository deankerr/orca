// * One queue message: observe endpoints for a model-variant, archive the response, refresh the
// * current cache on success. Shallow orchestration — pure parse/plan and delivery adapters plug in
// * here later. Archive write is primary; current-cache is best-effort.
import type { EndpointsQuery } from '@orca/schema/artifacts.ts'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import type { Archive } from '../archive/store.ts'
import type { Current } from '../current/cache.ts'
import * as Observation from '../current/observation.ts'
import * as OpenRouter from '../openrouter/client.ts'

export const processMessage = (deps: { archive: Archive; current: Current }) =>
  Effect.fn(function* process(query: EndpointsQuery) {
    const observed = yield* OpenRouter.endpoints(query)
    yield* deps.archive.putEndpoints({ ...observed, query })

    if (observed.status !== 200) {
      return
    }

    const next = Observation.parseEndpointsBody(observed.body)
    if (next === null) {
      return
    }

    const key = Observation.encodeScopeKey(query.permaslug, query.variant)
    const updatedAt = DateTime.formatIso(yield* DateTime.now)

    // * Archive already landed. Cache failures must not redelivery-loop a good observation —
    // * log and move on; the next crawl corrects partial state.
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
