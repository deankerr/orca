// * Capture worker: cron + queue + tiny HTTP surface for ops.
// *
// *   cron  → full sample (catalog → Work queue)
// *   queue → capture (Observations + Entities) → deliver current view (Convex)
// *   fetch → status / trigger full sample
// *
// * Capture does not know about delivery; this file wires the hand-off.
// * Failure policy: retry decode/capture/R2 via the queue; best-effort entities + delivery
// * (log richly, never redrive archive). CONVEX_SITE_URL + ENGINE_HTTP_API_KEY from Config.
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as Cause from 'effect/Cause'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Stream from 'effect/Stream'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { fromBinding } from './binding.ts'
import * as Detected from './capture/detected.ts'
import * as Plan from './capture/plan.ts'
import * as Process from './capture/process.ts'
import * as Store from './capture/store.ts'
import { decodeWorkMessage } from './capture/work-message.ts'
import * as Current from './delivery/current.ts'
import { Entities } from './resources/Entities.ts'
import { Observations } from './resources/Observations.ts'
import { Work } from './resources/Work.ts'

const logCause = (label: string) => (cause: Cause.Cause<unknown>) =>
  Effect.logError(label).pipe(Effect.annotateLogs({ cause: Cause.pretty(cause) }))

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
    const deliver = Current.deliver({
      apiKey: engineHttpApiKey,
      siteUrl: convexSiteUrl,
    })

    const observations = yield* Observations
    const work = yield* Work

    const d1 = yield* Cloudflare.D1.QueryDatabase(Entities)
    const sql = yield* SQL.D1(d1)
    const detected = Detected.make(sql)
    const store = Store.make(yield* Cloudflare.R2.ReadWriteBucket(observations))
    const queue = yield* Cloudflare.Queues.WriteQueue(work)

    const startFullSample = Plan.startFullSample({
      sendBatch: (messages) => fromBinding(queue.sendBatch(messages)),
      store,
    })
    const capture = Process.processWork({ detected, store })

    const onMessage = Effect.fn(function* onMessage(message: unknown) {
      const workMessage = yield* decodeWorkMessage(message)
      const result = yield* capture(workMessage)

      if (!result.observed) {
        return
      }

      // * Delivery is best-effort: archive already succeeded; do not redelivery-loop R2.
      yield* deliver(result.body).pipe(
        Effect.annotateLogs({ phase: 'delivery', scope: result.scopeKey }),
        Effect.tapError((error) =>
          Effect.logWarning('delivery failed').pipe(
            Effect.annotateLogs({
              detail: error.detail,
              reason: error.reason,
              ...(error.status === undefined ? {} : { status: String(error.status) }),
              ...(error.body === undefined ? {} : { responseBody: error.body }),
            }),
          ),
        ),
        Effect.catch(() => Effect.void),
      )
    })

    // * Daily full sample. One-off scopes can be enqueued any time without a plan file.
    yield* Cloudflare.Workers.cron('0 0 * * *', () =>
      startFullSample.pipe(Effect.tapCause(logCause('cron: full sample failed'))),
    )

    yield* Cloudflare.Queues.consumeQueueMessages(
      work,
      { batchSize: 1, maxConcurrency: 4, maxRetries: 3 },
      (stream) =>
        Stream.runForEach(stream, (message) =>
          onMessage(message.body).pipe(Effect.tapCause(logCause('queue: message failed'))),
        ),
    )

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
