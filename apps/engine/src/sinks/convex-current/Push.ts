// * HTTP push of product cards to Convex current-view.
import type { Endpoint } from '@orca/entities/endpoint.ts'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'

export type ConvexCurrentTarget = {
  /** Convex HTTP site origin, e.g. https://….convex.site (no trailing path). */
  readonly siteUrl: string
  readonly apiKey: Redacted.Redacted
}

export class ConvexCurrentError extends Data.TaggedError('ConvexCurrentError')<{
  readonly reason: 'request' | 'http' | 'response'
  readonly detail: string
  readonly status?: number
  readonly body?: string
}> {}

const decodePushResult = Schema.decodeUnknownEffect(
  Schema.fromJsonString(
    Schema.Struct({
      insert: Schema.Number,
      update: Schema.Number,
    }),
  ),
)

const endpointsUrl = (siteUrl: string) => `${siteUrl.replace(/\/$/, '')}/current/endpoints`

/** POST product cards to Convex. Caller must pass a non-empty list. */
export const pushEndpoints = (
  target: ConvexCurrentTarget,
  endpoints: ReadonlyArray<Endpoint>,
): Effect.Effect<{ insert: number; update: number }, ConvexCurrentError> =>
  Effect.gen(function* pushEndpoints() {
    const response = yield* Effect.tryPromise({
      catch: (cause) => new ConvexCurrentError({ detail: String(cause), reason: 'request' }),
      try: async () =>
        await fetch(endpointsUrl(target.siteUrl), {
          body: JSON.stringify({ endpoints }),
          headers: {
            authorization: `Bearer ${Redacted.value(target.apiKey)}`,
            'content-type': 'application/json',
          },
          method: 'POST',
        }),
    })

    const text = yield* Effect.tryPromise({
      catch: (cause) =>
        new ConvexCurrentError({ detail: `body read: ${String(cause)}`, reason: 'request' }),
      try: async () => await response.text(),
    })

    if (!response.ok) {
      return yield* new ConvexCurrentError({
        body: text,
        detail: `convex ${response.status}`,
        reason: 'http',
        status: response.status,
      })
    }

    return yield* decodePushResult(text).pipe(
      Effect.mapError(
        (error) =>
          new ConvexCurrentError({
            body: text,
            detail: String(error),
            reason: 'response',
          }),
      ),
    )
  })
