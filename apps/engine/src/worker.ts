// * The engine: one Worker wearing three hats.
// *
// *   cron  → plan a crawl (catalog → work list → queue)
// *   queue → process one model-variant (fetch → archive → current cache)
// *   fetch → HTTP API over archive + current
// *
// * They are one Worker because they are one pipeline. Resources are named module exports
// * (Alchemy style); this file only binds them and wires handlers. See notes/reports/alchemy.md.
// *
// * Crawl plan and per-message orchestration live under ./crawl/.
import { EndpointsQuery } from '@orca/schema/artifacts.ts'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import * as Api from './api/http.ts'
import * as Archive from './archive/store.ts'
import * as Plan from './crawl/plan.ts'
import * as ProcessMessage from './crawl/process-message.ts'
import * as Current from './current/cache.ts'
import { CurrentDatabase } from './resources/current-database.ts'
import { Endpoints } from './resources/endpoints.ts'
import { Responses } from './resources/responses.ts'

const decodeQuery = Schema.decodeUnknownEffect(EndpointsQuery)

export default class Engine extends Cloudflare.Worker<Engine>()(
  'Worker',
  {
    main: import.meta.url,
    // * Explicit so deploy state records the choice; Alchemy also defaults logs on when omitted.
    observability: { enabled: true },
  },
  Effect.gen(function* init() {
    // * Resource descriptors (stable Alchemy ids) — provisioning happens in the deploy engine.
    const responses = yield* Responses
    const endpoints = yield* Endpoints

    // * Runtime bindings over those resources.
    const d1 = yield* Cloudflare.D1.QueryDatabase(CurrentDatabase)
    const sql = yield* SQL.D1(d1)
    const current = Current.make(sql)

    const queue = yield* Cloudflare.Queues.WriteQueue(endpoints)
    const archive = Archive.make(yield* Cloudflare.R2.ReadWriteBucket(responses))

    const startCrawl = Plan.start({ archive, queue })
    const onMessage = ProcessMessage.processMessage({ archive, current })

    yield* Cloudflare.Workers.cron('0 * * * *', () =>
      startCrawl.pipe(Effect.tapCause(Effect.logError)),
    )

    // * `batchSize: 1` so batch-level and message-level retry are the same thing — Cloudflare
    // * retries batches, and per-message `retry()` races the runtime's ack. `maxConcurrency` is the
    // * throughput dial; 4 is politeness to OpenRouter, not a measured limit.
    yield* Cloudflare.Queues.consumeQueueMessages(
      endpoints,
      { batchSize: 1, maxConcurrency: 4, maxRetries: 3 },
      (stream) =>
        Stream.runForEach(stream, (message) =>
          // * R2 failures still redeliver. D1 failures are swallowed inside processMessage.
          decodeQuery(message.body).pipe(
            Effect.flatMap(onMessage),
            Effect.tapCause(Effect.logError),
          ),
        ),
    )

    // * ⚠️ `orDie` at the API boundary: `POST /crawl` declares no failure mode, so a catalog that will
    // * not come back is a logged defect and a 500 — which is what the cron path already does with it.
    return {
      fetch: Api.handler({
        archive,
        crawl: startCrawl.pipe(Effect.orDie),
        current,
      }),
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
