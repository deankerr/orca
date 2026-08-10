// * Crawl planning: fetch the catalog, store it as the batch denominator, queue one work unit per
// * model-variant. Never fetches endpoints itself — that keeps planning inside a Worker time budget.
import type { CrawlStarted } from '@orca/schema/artifacts.ts'
import { batchIdAt, EndpointsQuery } from '@orca/schema/artifacts.ts'
import type * as Cloudflare from 'alchemy/Cloudflare'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import type { Archive } from '../archive/store.ts'
import * as OpenRouter from '../openrouter/client.ts'
import { fromBinding } from '../runtime/binding.ts'

// * Cloudflare's per-call ceiling for `sendBatch`. The catalog is well over a thousand models, so
// * the work list is always chunked.
const QUEUE_BATCH_SIZE = 100

// * Turns three strings from the catalog into the ids the archive will accept. Failing here is
// * failing to plan the crawl, which is louder — and cheaper to notice — than a bad key.
const decodeQuery = Schema.decodeUnknownEffect(EndpointsQuery)

export const start = (deps: { archive: Archive; queue: Cloudflare.Queues.WriteQueueClient }) =>
  Effect.gen(function* startCrawl() {
    const batch = batchIdAt(yield* DateTime.now)
    const { body, models } = yield* OpenRouter.catalog()

    // * Stored before anything is queued, so a crawl that dies halfway still records what it
    // * intended to fetch.
    yield* deps.archive.putCatalog({ batch, body })

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
      yield* fromBinding(
        deps.queue.sendBatch(
          queries.slice(index, index + QUEUE_BATCH_SIZE).map((query) => ({ body: query })),
        ),
      )
    }

    yield* Effect.log(`batch ${batch} queued ${queries.length} of ${models.length} models`)
    return { batch, models: models.length, queued: queries.length } satisfies CrawlStarted
  })
