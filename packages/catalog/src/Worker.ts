import * as Axiom from 'alchemy/Axiom'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Cause from 'effect/Cause'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import CatalogWorkflow from './CatalogWorkflow.ts'
import { CatalogLogIngest, CatalogLogs } from './Observability.ts'

const retention = { errorRetention: '7 days', successRetention: '1 day' } as const

export default class Worker extends Cloudflare.Worker<Worker>()(
  'Worker',
  {
    main: import.meta.url,
    observability: { enabled: true },
  },
  Effect.gen(function* init() {
    const workflow = yield* CatalogWorkflow
    const catalogApiKey = yield* Config.redacted('CATALOG_API_KEY')

    yield* Cloudflare.Workers.cron('30 * * * *', () =>
      workflow.create({ retention }).pipe(Effect.asVoid),
    )

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const url = new URL(request.url, 'http://catalog')

        if (request.method === 'GET' && url.pathname === '/') {
          return yield* HttpServerResponse.json({
            package: '@orca/catalog',
          })
        }

        if (request.method === 'POST' && url.pathname === '/run') {
          if (request.headers.authorization !== `Bearer ${Redacted.value(catalogApiKey)}`) {
            return yield* HttpServerResponse.json({ error: 'unauthorized' }, { status: 401 })
          }

          const run = yield* workflow.create({ retention })

          return yield* HttpServerResponse.json({ runId: run.id }, { status: 202 })
        }

        return yield* HttpServerResponse.json({ error: 'not found' }, { status: 404 })
      }).pipe(
        Effect.catchCause((cause) =>
          HttpServerResponse.json({ error: Cause.pretty(cause) }, { status: 500 }),
        ),
      ),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.Workers.CronEventSourceLive,
        Axiom.Telemetry({ logs: CatalogLogs, token: CatalogLogIngest }),
      ),
    ),
  ),
) {}
