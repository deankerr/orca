// * Capture worker: cron + Work + Sinks + HTTP ops surface.
// *
// *   cron  → full sample (catalog → Work queue)
// *   Work  → capture (Observations + Entities) → enqueue Sinks (R2 ref)
// *   Sinks → windowed batch → load R2 → deliver current view (Convex)
// *   fetch → status / trigger full sample
// *
// * Failure policy:
// *   Work  — retry decode/capture/R2; entities best-effort; sink enqueue fails the message
// *   Sinks — hard error boundary: log and ack (never redrive capture via this queue)
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as Cause from 'effect/Cause'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
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
import { decodeSinkMessage } from './delivery/sink-message.ts'
import type { SinkMessage } from './delivery/sink-message.ts'
import { Entities } from './resources/Entities.ts'
import { Observations } from './resources/Observations.ts'
import { Sinks } from './resources/Sinks.ts'
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
    const deliverMany = Current.deliverMany({
      apiKey: engineHttpApiKey,
      siteUrl: convexSiteUrl,
    })

    const observations = yield* Observations
    const work = yield* Work
    const sinks = yield* Sinks

    const d1 = yield* Cloudflare.D1.QueryDatabase(Entities)
    const sql = yield* SQL.D1(d1)
    const detected = Detected.make(sql)
    const store = Store.make(yield* Cloudflare.R2.ReadWriteBucket(observations))
    const workQueue = yield* Cloudflare.Queues.WriteQueue(work)
    const sinksQueue = yield* Cloudflare.Queues.WriteQueue(sinks)

    const startFullSample = Plan.startFullSample({
      sendBatch: (messages) => fromBinding(workQueue.sendBatch(messages)),
      store,
    })
    const capture = Process.processWork({ detected, store })

    // * ── Work: capture only; enqueue Sinks ref on success ──────────────────────────────────

    const onWorkMessage = Effect.fn(function* onWorkMessage(message: unknown) {
      const workMessage = yield* decodeWorkMessage(message)
      const result = yield* capture(workMessage)

      if (!result.observed) {
        return
      }

      const sinkMessage: SinkMessage = {
        observedAt: result.observedAt,
        scopeKey: result.scopeKey,
      }
      yield* fromBinding(sinksQueue.send(sinkMessage))
    })

    // * ── Sinks: windowed batch → R2 load → Convex delivery (never fail the batch) ──────────

    const onSinksBatch = Effect.fn(function* onSinksBatch(
      messages: ReadonlyArray<{ body: unknown }>,
    ) {
      const items: Current.DeliverBody[] = []
      for (const message of messages) {
        const decoded = yield* decodeSinkMessage(message.body).pipe(
          Effect.tapError((error) =>
            Effect.logWarning('sinks: bad message').pipe(
              Effect.annotateLogs({
                detail: String(error),
                phase: 'sinks',
              }),
            ),
          ),
          Effect.option,
        )
        if (Option.isNone(decoded)) {
          continue
        }

        const ref = decoded.value
        const body = yield* store.getObservation(ref).pipe(
          Effect.tapError((error) =>
            Effect.logWarning('sinks: observation load failed').pipe(
              Effect.annotateLogs({
                detail: String(error),
                observedAt: ref.observedAt,
                phase: 'sinks',
                scope: ref.scopeKey,
              }),
            ),
          ),
          Effect.option,
        )
        if (Option.isSome(body)) {
          items.push({ body: body.value, scopeKey: ref.scopeKey })
        }
      }

      if (items.length === 0) {
        return
      }

      yield* deliverMany(items).pipe(
        Effect.annotateLogs({
          observations: String(items.length),
          phase: 'delivery',
        }),
        Effect.tapError((error) =>
          Effect.logWarning('delivery failed').pipe(
            Effect.annotateLogs({
              detail: error.detail,
              observations: String(items.length),
              phase: 'delivery',
              reason: error.reason,
              ...(error.status === undefined ? {} : { status: String(error.status) }),
              ...(error.body === undefined ? {} : { responseBody: error.body }),
            }),
          ),
        ),
        // * Hard boundary: product sink failures must not retry this queue (or re-capture).
        Effect.catch(() => Effect.void),
      )
    })

    // * Hourly full sample at :30.
    yield* Cloudflare.Workers.cron('30 * * * *', () =>
      startFullSample.pipe(Effect.tapCause(logCause('cron: full sample failed'))),
    )

    yield* Cloudflare.Queues.consumeQueueMessages(
      work,
      { batchSize: 1, maxConcurrency: 4, maxRetries: 3 },
      (stream) =>
        Stream.runForEach(stream, (message) =>
          onWorkMessage(message.body).pipe(Effect.tapCause(logCause('work: message failed'))),
        ),
    )

    // * Size-or-time bank before delivery. Independent of Work capture tuning.
    yield* Cloudflare.Queues.consumeQueueMessages(
      sinks,
      {
        batchSize: 25,
        maxConcurrency: 2,
        maxRetries: 0,
        maxWaitTime: '15 seconds',
      },
      (stream) =>
        Stream.runCollect(stream).pipe(
          Effect.flatMap((chunk) => onSinksBatch(chunk)),
          // * Belt-and-suspenders: decode defects etc. still ack the batch.
          Effect.catchCause((cause) =>
            Effect.logError('sinks: batch failed (acking)').pipe(
              Effect.annotateLogs({ cause: Cause.pretty(cause), phase: 'sinks' }),
            ),
          ),
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
