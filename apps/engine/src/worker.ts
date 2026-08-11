// * Composition root: bind resources, wire capture + sinks, ops HTTP.
// *
// *   cron / POST /capture → plan → Work queue
// *   Work  → capture (Observations + Entities) → enqueue ObservationRef
// *   Sinks → windowed batch → load R2 → fan-out product sinks
// *   fetch → status / trigger full sample
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as Cause from 'effect/Cause'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { fromBinding } from './binding.ts'
import * as Capture from './capture/consume.ts'
import * as Detected from './capture/detected.ts'
import * as Plan from './capture/plan.ts'
import * as Process from './capture/process.ts'
import * as ObservationsStore from './observations/store.ts'
import { Entities } from './resources/Entities.ts'
import { Observations } from './resources/Observations.ts'
import { Sinks } from './resources/Sinks.ts'
import { Work } from './resources/Work.ts'
import * as SinksQueue from './sinks/consume.ts'
import * as Delivery from './sinks/delivery/sink.ts'
import * as PublicApi from './sinks/public-api/sink.ts'

export default class Engine extends Cloudflare.Worker<Engine>()(
  'Worker',
  {
    main: import.meta.url,
    observability: { enabled: true },
  },
  Effect.gen(function* init() {
    // * Discovered at deploy; bound onto the Worker for runtime. Must be yielded in init.
    const convexSiteUrl = yield* Config.string('CONVEX_SITE_URL')
    const engineHttpApiKey = yield* Config.redacted('ENGINE_HTTP_API_KEY')

    const observations = yield* Observations
    const work = yield* Work
    const sinks = yield* Sinks

    const d1 = yield* Cloudflare.D1.QueryDatabase(Entities)
    const sql = yield* SQL.D1(d1)
    const detected = Detected.make(sql)
    const store = ObservationsStore.make(yield* Cloudflare.R2.ReadWriteBucket(observations))
    const workQueue = yield* Cloudflare.Queues.WriteQueue(work)
    const sinksQueue = yield* Cloudflare.Queues.WriteQueue(sinks)

    const startFullSample = Plan.startFullSample({
      sendBatch: (messages) => fromBinding(workQueue.sendBatch(messages)),
      store,
    })
    const capture = Process.processWork({ detected, store })

    const delivery = Delivery.make({
      apiKey: engineHttpApiKey,
      siteUrl: convexSiteUrl,
    })
    const publicApi = PublicApi.make()

    // * Hourly full sample at :30.
    yield* Cloudflare.Workers.cron('30 * * * *', () =>
      startFullSample.pipe(
        Effect.annotateLogs({ phase: 'plan' }),
        Effect.tapCause((cause) =>
          Effect.logError('plan: full sample failed').pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause), phase: 'plan' }),
          ),
        ),
      ),
    )

    yield* Capture.consume(work, { capture, sinksQueue })
    yield* SinksQueue.consume(sinks, { sinks: [delivery, publicApi], store })

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest.HttpServerRequest
        const path = new URL(request.url, 'http://worker').pathname

        if (request.method === 'GET' && path === '/') {
          const counts = yield* detected.status
          return yield* HttpServerResponse.json({
            endpoints: counts.endpoints,
            scopes: counts.scopes,
          })
        }

        if (request.method === 'POST' && path === '/capture') {
          const result = yield* startFullSample
          return yield* HttpServerResponse.json(result)
        }

        return yield* HttpServerResponse.json({ error: 'not found' }, { status: 404 })
      }).pipe(
        Effect.annotateLogs({ phase: 'ops' }),
        Effect.catchCause((cause) =>
          HttpServerResponse.json({ error: Cause.pretty(cause) }, { status: 500 }),
        ),
      ),
    }
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.Workers.CronEventSourceLive,
        Cloudflare.Queues.EventSourceLive,
        Cloudflare.Queues.WriteQueueBinding,
        Cloudflare.R2.ReadWriteBucketBinding,
        Cloudflare.D1.QueryDatabaseBinding,
      ),
    ),
  ),
) {}
