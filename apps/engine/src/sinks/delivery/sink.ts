// * Convex current-view sink plugin.
// * Own projection + HTTP push; bus only sees Sink + raw ObservationItem[].
import * as Effect from 'effect/Effect'

import type { Sink } from '../types.ts'
import { projectBatch } from './project.ts'
import { pushEndpoints } from './push.ts'
import type { DeliveryError, DeliveryTarget } from './push.ts'

/**
 * Project banked observations → product cards → one Convex upsert.
 * Empty projection is success (no push), not a sink failure.
 */
export const make = (target: DeliveryTarget): Sink<DeliveryError> => ({
  name: 'delivery',
  receive: (batch) =>
    Effect.gen(function* receive() {
      const endpoints = yield* projectBatch(batch)

      if (endpoints.length === 0) {
        yield* Effect.logWarning('delivery: batch projected nothing').pipe(
          Effect.annotateLogs({ observations: String(batch.length) }),
        )
        return
      }

      const result = yield* pushEndpoints(target, endpoints)
      yield* Effect.log('delivery: upserted batch').pipe(
        Effect.annotateLogs({
          insert: String(result.insert),
          observations: String(batch.length),
          projected: String(endpoints.length),
          update: String(result.update),
        }),
      )
    }).pipe(Effect.annotateLogs({ phase: 'delivery', sink: 'delivery' })),
})
