import * as Axiom from 'alchemy/Axiom'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { PublicApiV2LogIngest, PublicApiV2Logs } from './Observability.ts'
import { PublicApiV2 } from './PublicApiV2.ts'

function parseLimit(url: URL): number | undefined {
  const value = url.searchParams.get('limit')
  if (value === null || value === '') {
    return undefined
  }
  const limit = Math.trunc(Number(value))
  return Number.isFinite(limit) && limit > 0 ? limit : undefined
}

export default class Worker extends Cloudflare.Worker<Worker>()(
  'Worker',
  {
    main: import.meta.url,
    observability: { enabled: true },
  },
  Effect.gen(function* init() {
    const publicApiV2 = yield* PublicApiV2

    yield* Cloudflare.Workers.cron('*/5 * * * *', () =>
      publicApiV2.refresh.pipe(
        Effect.catchCause((cause) =>
          Effect.logError('public-api-v2: scheduled refresh failed').pipe(
            Effect.annotateLogs({
              cause: Cause.pretty(cause),
              phase: 'public-api-v2-refresh',
            }),
          ),
        ),
      ),
    )

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, 'http://public-api-v2')

        if (request.method === 'GET' && url.pathname === '/') {
          return yield* HttpServerResponse.json({ package: '@orca/public-api-v2' })
        }

        if (request.method === 'GET' && url.pathname === '/api/preview/v2/models') {
          const response = yield* publicApiV2.getModels({ limit: parseLimit(url) })
          return yield* HttpServerResponse.json(response, {
            headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
          })
        }

        return yield* HttpServerResponse.json({ error: 'not found' }, { status: 404 })
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError('public-api-v2: request failed').pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause), phase: 'public-api-v2-http' }),
            Effect.andThen(HttpServerResponse.json({ error: 'internal error' }, { status: 500 })),
          ),
        ),
      ),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        PublicApiV2.layer,
        Cloudflare.Workers.CronEventSourceLive,
        Axiom.Telemetry({ logs: PublicApiV2Logs, token: PublicApiV2LogIngest }),
      ),
    ),
  ),
) {}
