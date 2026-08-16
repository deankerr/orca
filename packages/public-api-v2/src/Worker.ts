import * as Axiom from 'alchemy/Axiom'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { PublicApiV2LogIngest, PublicApiV2Logs } from './Observability.ts'
import { PublicApiV2 } from './PublicApiV2.ts'

export default class Worker extends Cloudflare.Worker<Worker>()(
  'Worker',
  {
    main: import.meta.url,
    observability: { enabled: true },
  },
  // Init: take services from Layers. `fetch` below is a fresh Effect per request.
  Effect.gen(function* init() {
    const publicApiV2 = yield* PublicApiV2

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, 'http://public-api-v2')

        if (request.method === 'GET' && url.pathname === '/') {
          const body = yield* publicApiV2.getModels
          return HttpServerResponse.text(body, {
            contentType: 'application/json',
            headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
          })
        }

        return yield* HttpServerResponse.json({ error: 'not found' }, { status: 404 })
      }).pipe(
        // `catchCause` covers typed failures and defects (unhandled throws).
        Effect.catchCause((cause) =>
          Effect.logError('public-api-v2: request failed').pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) }),
            Effect.andThen(HttpServerResponse.json({ error: 'internal error' }, { status: 500 })),
          ),
        ),
      ),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        PublicApiV2.layer,
        Axiom.Telemetry({ logs: PublicApiV2Logs, token: PublicApiV2LogIngest }),
      ),
    ),
  ),
) {}
