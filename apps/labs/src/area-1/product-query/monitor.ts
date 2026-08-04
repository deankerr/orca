import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { eventsForCrawls } from './events.ts'
import type { MonitorPageOptions } from './types.ts'

interface CrawlIdRow {
  readonly crawl_id: string
}

const upperCursor = '99999999999999999999'

export const monitorPage = Effect.fn('labs.monitorPage')(function* monitorPage(
  options: MonitorPageOptions,
) {
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    return yield* Effect.fail(new Error('Monitor page limit must be a positive integer'))
  }

  const sql = yield* SqlClient.SqlClient
  const before = options.before ?? upperCursor
  const take = options.limit + 1
  let rows: readonly CrawlIdRow[]

  // Keep these query shapes explicit so SQLite can use each matching composite index.
  if (options.modelSlug !== undefined && options.providerName !== undefined) {
    rows = yield* sql<CrawlIdRow>`
      SELECT DISTINCT crawl_id FROM entity_events
      WHERE model_slug = ${options.modelSlug}
        AND provider_name = ${options.providerName}
        AND crawl_id < ${before}
      ORDER BY crawl_id DESC LIMIT ${take}`
  } else if (options.modelSlug !== undefined) {
    rows = yield* sql<CrawlIdRow>`
      SELECT DISTINCT crawl_id FROM entity_events
      WHERE model_slug = ${options.modelSlug} AND crawl_id < ${before}
      ORDER BY crawl_id DESC LIMIT ${take}`
  } else if (typeof options.providerName === 'string') {
    rows = yield* sql<CrawlIdRow>`
      SELECT DISTINCT crawl_id FROM entity_events
      WHERE provider_name = ${options.providerName} AND crawl_id < ${before}
      ORDER BY crawl_id DESC LIMIT ${take}`
  } else {
    rows = yield* sql<CrawlIdRow>`
      SELECT DISTINCT crawl_id FROM entity_events
      WHERE crawl_id < ${before}
      ORDER BY crawl_id DESC LIMIT ${take}`
  }

  const hasMore = rows.length > options.limit
  const crawlIds = rows.slice(0, options.limit).map((row) => row.crawl_id)
  const events = yield* eventsForCrawls(crawlIds)
  const eventsByCrawl = Map.groupBy(events, (event) => event.crawlId)

  return {
    batches: crawlIds.map((crawlId) => ({
      crawlId,
      events: eventsByCrawl.get(crawlId) ?? [],
      observedAt: new Date(Number(crawlId)).toISOString(),
    })),
    ...(hasMore ? { nextBefore: crawlIds.at(-1) } : {}),
  }
})
