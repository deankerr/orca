// * The engine: one Worker wearing three hats.
// *
// *   cron  → fetch the catalog, turn it into a work list, put the list on the queue
// *   queue → fetch one model's endpoints, write the response to its own file in the archive
// *   fetch → the API over what has been stored (./api.ts), and a manual trigger
// *
// * They are one Worker because they are one pipeline. The bucket and queue are declared inside the
// * init effect rather than in `alchemy.run.ts` because `main: import.meta.url` requires the Worker
// * to be this file's default export — see notes/data-architecture/alchemy.md.
// *
// * D1 current cache is bound here too; the database resource itself lives in ./database.ts so
// * migrations can be applied on deploy without coupling them to the Worker entry.
import { batchIdAt, EndpointsQuery } from '@orca/schema/artifacts.ts'
import type { CrawlStarted } from '@orca/schema/artifacts.ts'
import { RuntimeContext } from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as SQL from 'alchemy/SQL/D1'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

import * as Api from './api.ts'
import * as Artifacts from './artifacts.ts'
import * as Current from './current.ts'
import { CurrentDatabase } from './database.ts'
import * as Observation from './observation.ts'
import * as OpenRouter from './openrouter.ts'

// * Cloudflare's per-call ceiling for `sendBatch`. The catalog is well over a thousand models, so
// * the work list is always chunked.
const QUEUE_BATCH_SIZE = 100

// * Turns three strings from the catalog into the ids the archive will accept. Failing here is
// * failing to plan the crawl, which is louder — and cheaper to notice — than a bad key.
const decodeQuery = Schema.decodeUnknownEffect(EndpointsQuery)

export default class Engine extends Cloudflare.Worker<Engine>()(
  'Worker',
  { main: import.meta.url },
  Effect.gen(function* init() {
    // * where every response lands, one file per model per crawl
    const responses = yield* Cloudflare.R2.Bucket('Responses')

    // * the pacing layer between "what to fetch" and "fetch it". Also the retry mechanism: a
    // * failed message comes back on its own rather than needing a bookkeeping table.
    const endpoints = yield* Cloudflare.Queues.Queue('Endpoints')

    // * disposable observation cache; planTransition + product delivery land later
    const d1 = yield* Cloudflare.D1.QueryDatabase(CurrentDatabase)
    const sql = yield* SQL.D1(d1)
    const current = Current.make(sql)

    const queue = yield* Cloudflare.Queues.WriteQueue(endpoints)
    const artifacts = Artifacts.make(yield* Cloudflare.R2.ReadWriteBucket(responses))

    // * Decide what to ask for and hand it to the queue. This never fetches an endpoint itself,
    // * which is what keeps it inside a Worker's time budget however large the catalog grows.
    const startCrawl = Effect.gen(function* startCrawl() {
      const batch = batchIdAt(yield* DateTime.now)
      const { body, models } = yield* OpenRouter.catalog()

      // * Stored before anything is queued, so a crawl that dies halfway still records what it
      // * intended to fetch.
      yield* artifacts.putCatalog({ batch, body })

      // * Skipped: a model with no `endpoint` has nothing serving it, and a `~`-prefixed slug is an
      // * alias for a model already in the list.
      const queries = yield* Effect.forEach(
        models.filter((model) => model.endpoint !== null && !model.slug.startsWith('~')),
        (model) =>
          decodeQuery({
            batch,
            permaslug: model.permaslug,
            // * non-null by the filter above; the fallback avoids a type assertion
            variant: model.endpoint?.variant ?? 'standard',
          }),
      ).pipe(Effect.orDie)

      for (let index = 0; index < queries.length; index += QUEUE_BATCH_SIZE) {
        yield* queue
          .sendBatch(
            queries.slice(index, index + QUEUE_BATCH_SIZE).map((query) => ({ body: query })),
          )
          // * ⚠️ `phantom` erases the `RuntimeContext` requirement the queue binding asks of every
          // * call — see the same note in ./artifacts.ts, which is where it is explained.
          .pipe(Effect.orDie, Effect.provide(RuntimeContext.phantom))
      }

      yield* Effect.log(`batch ${batch} queued ${queries.length} of ${models.length} models`)
      return { batch, models: models.length, queued: queries.length } satisfies CrawlStarted
    })

    // * Archive first, always. Current-cache is best-effort and must not redelivery-loop a good
    // * observation when D1 is unhappy — log and move on; the next crawl corrects partial state.
    const storeEndpoints = Effect.fn(function* storeEndpoints(query: EndpointsQuery) {
      const observed = yield* OpenRouter.endpoints(query)
      yield* artifacts.putEndpoints({ ...observed, query })

      if (observed.status !== 200) {
        return
      }

      const next = Observation.parseEndpointsBody(observed.body)
      if (next === null) {
        return
      }

      const key = Observation.encodeScopeKey(query.permaslug, query.variant)
      yield* current
        .put({
          key,
          observation: next,
          observedBatch: query.batch,
          updatedAt: new Date().toISOString(),
        })
        .pipe(
          Effect.tapCause((cause) =>
            Effect.logWarning('current-cache put failed', {
              cause,
              endpoints: next.endpoints.length,
              permaslug: query.permaslug,
              variant: query.variant,
            }),
          ),
          Effect.catchCause(() => Effect.void),
        )
    })

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
          // * R2 failures still redeliver. D1 failures are swallowed inside storeEndpoints.
          decodeQuery(message.body).pipe(
            Effect.flatMap(storeEndpoints),
            Effect.tapCause(Effect.logError),
          ),
        ),
    )

    // * ⚠️ `orDie` at the API boundary: `POST /crawl` declares no failure mode, so a catalog that will
    // * not come back is a logged defect and a 500 — which is what the cron path already does with it.
    return {
      fetch: Api.handler({
        artifacts,
        crawl: startCrawl.pipe(Effect.orDie),
        current,
      }),
    }
  }).pipe(
    Effect.provide(Cloudflare.Workers.CronEventSourceLive),
    Effect.provide(Cloudflare.Queues.EventSourceLive),
    Effect.provide(Cloudflare.Queues.WriteQueueBinding),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
  ),
) {}
