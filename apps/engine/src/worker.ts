// * The engine: one Worker wearing three hats.
// *
// *   cron  → fetch the catalog, turn it into a work list, put the list on the queue
// *   queue → fetch one model's endpoints, write the response to its own file in the bucket
// *   fetch → a manual trigger, and a way to see what landed
// *
// * They are one Worker because they are one pipeline. The bucket and queue are declared inside the
// * init effect rather than in `alchemy.run.ts` because `main: import.meta.url` requires the Worker
// * to be this file's default export — see notes/data-architecture/alchemy.md.
import { EndpointsQuery } from '@orca/schema/openrouter.ts'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'
import { HttpServerRequest } from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

import * as OpenRouter from './openrouter.ts'

// * Cloudflare's per-call ceiling for `sendBatch`. The catalog is well over a thousand models, so
// * the work list is always chunked.
const QUEUE_BATCH_SIZE = 100

const encodeQuery = Schema.encodeUnknownEffect(EndpointsQuery)
const decodeQuery = Schema.decodeUnknownEffect(EndpointsQuery)

// * A batch is named by the UTC moment its crawl started, ISO-8601 with the colons dashed out:
// * `2026-07-27T04-33-43Z`. The format is the index — every level of narrowing is a longer prefix,
// * and lexicographic order is chronological order. See README.md for the layout and its trade.
const batchKey = DateTime.now.pipe(
  // * seconds are enough to name a crawl; milliseconds would only add noise to a typed prefix
  Effect.map((now) => `${DateTime.formatIso(now).slice(0, 19).replaceAll(':', '-')}Z`),
)

// * One flat file per batch: `anthropic.claude-4.7-opus-20260416.standard.json`.
// *
// * ⚠️ The `.` separators read well but do not parse: model names contain dots of their own
// * (`gpt-3.5-turbo`). `permaslug` and `variant` go in object metadata for machines to read.
const objectKey = (query: EndpointsQuery) =>
  `endpoints/${query.batch}/${query.permaslug.replaceAll('/', '.')}.${query.variant}.json`

// * Its own top-level prefix, so a batch prefix lists one kind of file and `catalog/` stays the
// * cheap way to enumerate crawls.
const catalogKey = (batch: string) => `catalog/${batch}.json`

export default class Engine extends Cloudflare.Worker<Engine>()(
  'Worker',
  { main: import.meta.url },
  Effect.gen(function* init() {
    // * where every response lands, one file per model per crawl
    const responses = yield* Cloudflare.R2.Bucket('Responses')

    // * the pacing layer between "what to fetch" and "fetch it". Also the retry mechanism: a
    // * failed message comes back on its own rather than needing a bookkeeping table.
    const endpoints = yield* Cloudflare.Queues.Queue('Endpoints')

    const queue = yield* Cloudflare.Queues.WriteQueue(endpoints)
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(responses)

    // * Metadata carries what is worth having without fetching the object, so a listing can filter
    // * on it. Everything else is in the body.
    const store = Effect.fn(function* store(args: {
      key: string
      body: string
      status: number
      // * identifies the thing observed. The catalog has no identity, so this is optional.
      attrs?: Record<string, string>
    }) {
      const { key, body, status } = args

      yield* bucket
        .put(key, body, {
          customMetadata: {
            ...args.attrs,
            // * full precision here, unlike the batch key: this is the time axis a consumer reads,
            // * not a prefix a human types
            observed_at: DateTime.formatIso(yield* DateTime.now),
            status: String(status),
          },
          httpMetadata: { contentType: 'application/json' },
        })
        .pipe(Effect.orDie)

      yield* Effect.log(`stored ${key} (${status}, ${body.length} bytes)`)
    })

    // * Decide what to ask for and hand it to the queue. This never fetches an endpoint itself,
    // * which is what keeps it inside a Worker's time budget however large the catalog grows.
    const startCrawl = Effect.fn(function* startCrawl() {
      const batch = yield* batchKey
      const { body, models } = yield* OpenRouter.catalog()

      // * Stored before anything is queued, so a crawl that dies halfway still records what it
      // * intended to fetch.
      yield* store({ body, key: catalogKey(batch), status: 200 })

      // * Skipped: a model with no `endpoint` has nothing serving it, and a `~`-prefixed slug is an
      // * alias for a model already in the list.
      const queries = yield* Effect.forEach(
        models.filter((model) => model.endpoint !== null && !model.slug.startsWith('~')),
        (model) =>
          encodeQuery({
            batch,
            permaslug: model.permaslug,
            // * non-null by the filter above; the fallback avoids a type assertion
            variant: model.endpoint?.variant ?? 'standard',
          }),
      )

      for (let index = 0; index < queries.length; index += QUEUE_BATCH_SIZE) {
        yield* queue
          .sendBatch(
            queries.slice(index, index + QUEUE_BATCH_SIZE).map((query) => ({ body: query })),
          )
          .pipe(Effect.orDie)
      }

      yield* Effect.log(`batch ${batch} queued ${queries.length} of ${models.length} models`)
      return { batch, models: models.length, queued: queries.length }
    })

    const storeEndpoints = Effect.fn(function* storeEndpoints(query: EndpointsQuery) {
      const response = yield* OpenRouter.endpoints(query)

      yield* store({
        attrs: { permaslug: query.permaslug, variant: query.variant },
        body: yield* OpenRouter.document(response),
        key: objectKey(query),
        status: response.status,
      })
    })

    yield* Cloudflare.Workers.cron('0 * * * *', () =>
      startCrawl().pipe(Effect.tapCause(Effect.logError)),
    )

    // * `batchSize: 1` so batch-level and message-level retry are the same thing — Cloudflare
    // * retries batches, and per-message `retry()` races the runtime's ack. `maxConcurrency` is the
    // * throughput dial; 4 is politeness to OpenRouter, not a measured limit.
    yield* Cloudflare.Queues.consumeQueueMessages(
      endpoints,
      { batchSize: 1, maxConcurrency: 4, maxRetries: 3 },
      (stream) =>
        Stream.runForEach(stream, (message) =>
          // * Nothing is caught: a settled non-200 already came back as a stored observation, so
          // * anything failing here is a transport failure, a failed put, or an undecodable
          // * message — all cases for redelivery.
          decodeQuery(message.body).pipe(
            Effect.flatMap(storeEndpoints),
            Effect.tapCause(Effect.logError),
          ),
        ),
    )

    return {
      fetch: Effect.gen(function* fetch() {
        const request = yield* HttpServerRequest
        const url = new URL(request.url, 'http://engine')

        if (request.method === 'POST' && url.pathname === '/crawl') {
          return yield* HttpServerResponse.json(yield* startCrawl(), { status: 202 })
        }

        // * How a crawl is checked: count what landed under its prefix.
        if (request.method === 'GET' && url.pathname === '/objects') {
          const prefix = url.searchParams.get('prefix') ?? 'endpoints/'
          const listing = yield* bucket.list({ prefix }).pipe(Effect.orDie)
          return yield* HttpServerResponse.json({
            bytes: listing.objects.reduce((total, object) => total + object.size, 0),
            keys: listing.objects.slice(0, 10).map((object) => object.key),
            prefix,
            returned: listing.objects.length,
            truncated: listing.truncated,
          })
        }

        return yield* HttpServerResponse.json({ engine: 'orca' })
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError(cause).pipe(
            Effect.andThen(
              HttpServerResponse.json(
                { detail: String(cause), error: 'engine error' },
                {
                  status: 500,
                },
              ),
            ),
          ),
        ),
      ),
    }
  }).pipe(
    Effect.provide(Cloudflare.Workers.CronEventSourceLive),
    Effect.provide(Cloudflare.Queues.EventSourceLive),
    Effect.provide(Cloudflare.Queues.WriteQueueBinding),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
  ),
) {}
