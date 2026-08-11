// * Raw archive body → product endpoint cards (Convex current-view shape).
// * Private to delivery — other sinks must not depend on this projection.
// *
// * Archive bodies are validated `{ data: [...] }` envelopes from capture. Product
// * decode is stricter than capture identity, so individual rows may still fail;
// * those are skipped (log), not sink failures.
import { decodeEndpoint } from '@orca/entities/endpoint.ts'
import type { Endpoint } from '@orca/entities/endpoint.ts'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import type { ObservationItem } from '../types.ts'

const Envelope = Schema.Struct({
  data: Schema.Array(Schema.Unknown),
})
const decodeEnvelope = Schema.decodeUnknownOption(Schema.fromJsonString(Envelope))

/** Project one observation body to product cards. Empty when unusable. */
const projectItem = (item: ObservationItem): Effect.Effect<Endpoint[]> =>
  Effect.gen(function* projectItem() {
    const envelope = decodeEnvelope(item.body)
    if (Option.isNone(envelope)) {
      // Unexpected: capture only archives validated envelopes.
      yield* Effect.logWarning('delivery: body is not a data envelope').pipe(
        Effect.annotateLogs({
          body: item.body,
          phase: 'delivery',
          scope: item.scopeKey,
        }),
      )
      return []
    }

    const endpoints: Endpoint[] = []
    const rowErrors: number[] = []
    for (const [index, row] of envelope.value.data.entries()) {
      const card = yield* Effect.try({
        catch: () => new Error('product decode'),
        try: () => decodeEndpoint(row),
      }).pipe(Effect.option)
      if (Option.isSome(card)) {
        endpoints.push(card.value)
      } else {
        rowErrors.push(index)
      }
    }

    if (rowErrors.length > 0) {
      yield* Effect.logWarning('delivery: row product decode failures').pipe(
        Effect.annotateLogs({
          dataLength: String(envelope.value.data.length),
          failedIndexes: JSON.stringify(rowErrors),
          ok: String(endpoints.length),
          phase: 'delivery',
          scope: item.scopeKey,
        }),
      )
    }

    return endpoints
  })

/** Project a banked batch into one combined card list. */
export const projectBatch = (batch: ReadonlyArray<ObservationItem>): Effect.Effect<Endpoint[]> =>
  Effect.gen(function* projectBatch() {
    const endpoints: Endpoint[] = []
    for (const item of batch) {
      endpoints.push(...(yield* projectItem(item)))
    }
    return endpoints
  })
