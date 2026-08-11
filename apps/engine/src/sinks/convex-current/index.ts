// * Convex current-view sink adapter (Sink port).
// * Projection + HTTP push are private; bus only sees Sink + ObservationItem[].
import * as Effect from 'effect/Effect'

import type { Sink } from '../Sink.ts'
import { projectBatch } from './Project.ts'
import { pushEndpoints } from './Push.ts'
import type { ConvexCurrentError, ConvexCurrentTarget } from './Push.ts'

export type { ConvexCurrentError, ConvexCurrentTarget } from './Push.ts'

/**
 * Project banked observations → product cards → one Convex upsert.
 * Empty projection is success (no push), not a sink failure.
 */
export const make = (target: ConvexCurrentTarget): Sink<ConvexCurrentError> => ({
  name: 'convex-current',
  receive: (batch) =>
    Effect.gen(function* receive() {
      const endpoints = yield* projectBatch(batch)

      if (endpoints.length === 0) {
        yield* Effect.logWarning('convex-current: batch projected nothing').pipe(
          Effect.annotateLogs({ observations: String(batch.length) }),
        )
        return
      }

      const result = yield* pushEndpoints(target, endpoints)
      yield* Effect.log('convex-current: upserted batch').pipe(
        Effect.annotateLogs({
          insert: String(result.insert),
          observations: String(batch.length),
          projected: String(endpoints.length),
          update: String(result.update),
        }),
      )
    }).pipe(Effect.annotateLogs({ phase: 'convex-current', sink: 'convex-current' })),
})
