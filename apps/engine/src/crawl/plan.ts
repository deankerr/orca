// * Fetch catalog → store batch denominator → queue one work unit per crawlable model-variant.
// * Never fetches endpoints itself.
import type { CrawlStarted, EndpointsQuery } from '@orca/schema/artifacts.ts'
import { batchIdAt } from '@orca/schema/artifacts.ts'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'

import type { Archive } from '../archive/store.ts'
import * as OpenRouter from '../openrouter/client.ts'
import { workList } from './work-list.ts'

/** Cloudflare `sendBatch` ceiling. Catalog is well over a thousand models. */
const QUEUE_BATCH_SIZE = 100

const chunks = <A>(items: ReadonlyArray<A>, size: number): A[][] => {
  const out: A[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

export const startCrawl = (deps: {
  archive: Archive
  /** Already binding-colored (Worker applies `fromBinding`). */
  sendBatch: (messages: ReadonlyArray<{ body: EndpointsQuery }>) => Effect.Effect<void>
}) =>
  Effect.gen(function* startCrawl() {
    const batch = batchIdAt(yield* DateTime.now)
    const { body, models } = yield* OpenRouter.catalog()

    // * Before queueing, so a half-finished crawl still records what it intended to fetch.
    yield* deps.archive.putCatalog({ batch, body })

    const queries = workList(batch, models)

    for (const chunk of chunks(queries, QUEUE_BATCH_SIZE)) {
      yield* deps.sendBatch(chunk.map((query) => ({ body: query })))
    }

    yield* Effect.log(`batch ${batch} queued ${queries.length} of ${models.length} models`)
    return { batch, models: models.length, queued: queries.length } satisfies CrawlStarted
  })
