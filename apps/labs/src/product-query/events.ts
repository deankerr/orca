import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { decodeEventRows } from './decode.ts'
import type { EventRow } from './decode.ts'

const eventColumns = `
  e.event_id, e.crawl_id, e.entity_type, e.entity_id, e.event_type,
  e.model_slug, e.provider_name, e.provider_slug, e.context_json,
  f.ordinal, f.path, f.before_present, f.before_json, f.after_present, f.after_json
`

export const eventsForCrawls = Effect.fn('labs.eventsForCrawls')(function* eventsForCrawls(
  crawlIds: readonly string[],
) {
  if (crawlIds.length === 0) {
    return []
  }
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql.unsafe<EventRow>(
    `SELECT ${eventColumns}
     FROM entity_events AS e
     LEFT JOIN event_fields AS f ON f.event_id = e.event_id
     WHERE e.crawl_id IN (${crawlIds.map(() => '?').join(', ')})
     ORDER BY e.crawl_id DESC, e.entity_type, e.entity_id, f.ordinal`,
    crawlIds,
  )
  return decodeEventRows(rows)
})

export const eventsForLiveCrawl = Effect.fn('labs.eventsForLiveCrawl')(function* eventsForLiveCrawl(
  crawlId: string,
) {
  return yield* eventsForCrawls([crawlId])
})
