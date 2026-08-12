// * HTTP push of product cards to Convex current-view.
import type { Endpoint } from '@orca/entities/endpoint.ts'
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import type * as Redacted from 'effect/Redacted'
import * as Schema from 'effect/Schema'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse'

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

const PushResult = Schema.Struct({
  insert: Schema.Finite,
  update: Schema.Finite,
})

const endpointsUrl = (siteUrl: string) => `${siteUrl.replace(/\/$/, '')}/current/endpoints`

/** POST product cards to Convex. Caller must pass a non-empty list. */
export const pushEndpoints = (
  target: ConvexCurrentTarget,
  endpoints: ReadonlyArray<Endpoint>,
): Effect.Effect<{ insert: number; update: number }, ConvexCurrentError> =>
  Effect.gen(function* pushEndpoints() {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(HttpClientRequest.bearerToken(target.apiKey), HttpClientRequest.acceptJson),
      ),
    )

    const response = yield* HttpClientRequest.post(endpointsUrl(target.siteUrl)).pipe(
      HttpClientRequest.bodyJson({ endpoints }),
      Effect.flatMap(client.execute),
      Effect.mapError(
        (error) => new ConvexCurrentError({ detail: String(error), reason: 'request' }),
      ),
    )

    if (response.status < 200 || response.status >= 300) {
      const body = yield* response.text.pipe(
        Effect.mapError(
          (error) =>
            new ConvexCurrentError({
              detail: `body read: ${String(error)}`,
              reason: 'request',
              status: response.status,
            }),
        ),
      )
      return yield* new ConvexCurrentError({
        body,
        detail: `convex ${response.status}`,
        reason: 'http',
        status: response.status,
      })
    }

    return yield* HttpClientResponse.schemaBodyJson(PushResult)(response).pipe(
      Effect.mapError(
        (error) =>
          new ConvexCurrentError({
            detail: String(error),
            reason: 'response',
          }),
      ),
    )
  }).pipe(Effect.provide(FetchHttpClient.layer))
