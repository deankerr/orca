// * Composition root: bind resources, wire capture + sinks, ops + public API HTTP.
// *
// *   cron / POST /capture → full sample → CaptureQueue
// *   Capture → Observations + EntityClocks → enqueue ObservationRef
// *   Sinks → windowed batch → load R2 → fan-out product sinks
// *   fetch → status / trigger full sample / public-api v2 models
import * as PublicApiV2 from '@orca/public-api-v2'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as Cause from 'effect/Cause'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import { fromBinding } from './binding.ts'
import * as Capture from './capture/index.ts'
import * as EntityClocks from './entities/index.ts'
import { withAppLogger } from './logging.ts'
import * as ObservationStore from './observations/index.ts'
import { CaptureQueue } from './resources/CaptureQueue.ts'
import { EntitiesDB } from './resources/EntitiesDB.ts'
import { ObservationsBucket } from './resources/ObservationsBucket.ts'
import { PublicApiV2DB } from './resources/PublicApiV2DB.ts'
import { SinksQueue } from './resources/SinksQueue.ts'
import * as ConvexCurrent from './sinks/convex-current/index.ts'
import * as Sinks from './sinks/index.ts'

export default class Engine extends Cloudflare.Worker<Engine>()(
  'Worker',
  {
    main: import.meta.url,
    observability: { enabled: true },
  },
  Effect.gen(function* init() {
    // 1. Config — discovered at deploy; bound onto the Worker for runtime.
    const convexSiteUrl = yield* Config.string('CONVEX_SITE_URL')
    const engineHttpApiKey = yield* Config.redacted('ENGINE_HTTP_API_KEY')

    // 2–3. Resources + clients
    const observationsBucket = yield* ObservationsBucket
    const observationStore = ObservationStore.make(
      yield* Cloudflare.R2.ReadWriteBucket(observationsBucket),
    )

    const entitiesDb = yield* EntitiesDB
    const entityClocks = EntityClocks.make(
      yield* SQL.D1(yield* Cloudflare.D1.QueryDatabase(entitiesDb)),
    )

    const publicApiV2Db = yield* PublicApiV2DB
    const publicApiV2 = PublicApiV2.make({
      sql: yield* SQL.D1(yield* Cloudflare.D1.QueryDatabase(publicApiV2Db)),
    })

    const captureQueue = yield* CaptureQueue
    const captureQueueWriter = yield* Cloudflare.Queues.WriteQueue(captureQueue)

    const sinksQueue = yield* SinksQueue
    const sinksQueueWriter = yield* Cloudflare.Queues.WriteQueue(sinksQueue)

    // 4. Deep pipelines
    const startFullSample = Capture.startFullSample({
      observationStore,
      sendBatch: (messages) => fromBinding(captureQueueWriter.sendBatch(messages)),
    })

    yield* Cloudflare.Workers.cron('30 * * * *', () =>
      withAppLogger(
        startFullSample.pipe(
          Effect.annotateLogs({ phase: 'full-sample' }),
          Effect.tapCause((cause) =>
            Effect.logError('full-sample: failed').pipe(
              Effect.annotateLogs({ cause: Cause.pretty(cause), phase: 'full-sample' }),
            ),
          ),
        ),
      ),
    )

    yield* Capture.wire({
      entityClocks,
      observationStore,
      queue: captureQueue,
      sinksQueueWriter,
    })

    yield* Sinks.wire({
      observationStore,
      queue: sinksQueue,
      sinks: [
        ConvexCurrent.make({
          apiKey: engineHttpApiKey,
          siteUrl: convexSiteUrl,
        }),
        publicApiV2,
      ],
    })

    // 5. Ops + public API HTTP
    return {
      fetch: withAppLogger(
        Effect.gen(function* fetch() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const url = new URL(request.url, 'http://worker')
          const path = url.pathname

          if (request.method === 'GET' && path === '/') {
            const counts = yield* entityClocks.status
            return yield* HttpServerResponse.json({
              endpoints: counts.endpoints,
              scopes: counts.scopes,
            })
          }

          if (request.method === 'GET' && path === '/public-api/v2/models') {
            const limitParam = url.searchParams.get('limit')
            const limit =
              limitParam === null || limitParam === '' ? undefined : Math.trunc(Number(limitParam))
            const body = yield* publicApiV2.getModels({
              limit: limit !== undefined && Number.isFinite(limit) && limit > 0 ? limit : undefined,
            })
            return yield* HttpServerResponse.json(body, {
              headers: {
                // * Hostile clients may ignore; CDN / intermediate caches can still use this.
                'Cache-Control': 'public, max-age=60, s-maxage=60',
              },
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
