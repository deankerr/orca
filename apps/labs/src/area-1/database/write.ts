import * as Effect from 'effect/Effect'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import type { CrawlPlan } from '../projection/types.ts'
import { canonicalJson } from '../transform/json.ts'

const chunk = <A>(items: readonly A[], size: number): readonly (readonly A[])[] => {
  const groups: A[][] = []
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size))
  }
  return groups
}

const jsonValue = (present: boolean, value: unknown) => (present ? canonicalJson(value) : null)

/** Atomically advances current state, latest metrics, and immutable history for one crawl. */
export const commitCrawl = Effect.fn('labs.commitCrawl')(function* commitCrawl(plan: CrawlPlan) {
  const sql = yield* SqlClient.SqlClient
  const { batch, events } = plan

  yield* sql.withTransaction(
    Effect.gen(function* transaction() {
      // Record crawl lineage
      yield* sql`INSERT INTO crawls ${sql.insert({
        crawl_id: batch.crawlId,
        previous_crawl_id: plan.previousCrawlId ?? null,
        processed_at: new Date(Number(batch.crawlId)).toISOString(),
      })}`

      // Advance current entity state
      const deletedModels = events.flatMap((event) =>
        event.entityType === 'model' && event.eventType === 'unavailable' ? [event.entityId] : [],
      )
      const deletedEndpoints = events.flatMap((event) =>
        event.entityType === 'endpoint' && event.eventType === 'unavailable'
          ? [event.entityId]
          : [],
      )
      const modelRows = events.flatMap((event) =>
        event.entityType === 'model' && event.eventType !== 'unavailable'
          ? [
              {
                slug: event.entityId,
                state_json: canonicalJson(event.context),
                updated_crawl_id: event.crawlId,
              },
            ]
          : [],
      )
      const endpointRows = events.flatMap((event) => {
        if (event.entityType !== 'endpoint' || event.eventType === 'unavailable') {
          return []
        }
        return [
          {
            id: event.entityId,
            model_slug: event.modelSlug,
            provider_name: event.providerName ?? null,
            provider_slug: event.providerSlug ?? null,
            state_json: canonicalJson(event.context.endpoint),
            updated_crawl_id: event.crawlId,
          },
        ]
      })

      for (const ids of chunk(deletedModels, 500)) {
        yield* sql`DELETE FROM models WHERE slug IN ${sql.in(ids)}`
      }
      for (const ids of chunk(deletedEndpoints, 500)) {
        yield* sql`DELETE FROM endpoints WHERE id IN ${sql.in(ids)}`
      }
      for (const rows of chunk(modelRows, 200)) {
        yield* sql`INSERT INTO models ${sql.insert(rows)} ON CONFLICT(slug) DO UPDATE SET state_json=excluded.state_json, updated_crawl_id=excluded.updated_crawl_id`
      }
      for (const rows of chunk(endpointRows, 200)) {
        yield* sql`INSERT INTO endpoints ${sql.insert(rows)} ON CONFLICT(id) DO UPDATE SET model_slug=excluded.model_slug, provider_name=excluded.provider_name, provider_slug=excluded.provider_slug, state_json=excluded.state_json, updated_crawl_id=excluded.updated_crawl_id`
      }

      // Replace latest observations
      yield* sql`DELETE FROM endpoint_metrics`
      const metrics = batch.endpoints.flatMap((item) =>
        item.metrics === undefined
          ? []
          : [
              {
                crawl_id: batch.crawlId,
                endpoint_id: item.endpoint.id,
                p50_latency: item.metrics.p50Latency ?? null,
                p50_throughput: item.metrics.p50Throughput ?? null,
              },
            ],
      )
      for (const rows of chunk(metrics, 200)) {
        yield* sql`INSERT INTO endpoint_metrics ${sql.insert(rows)}`
      }

      // Append immutable product evidence
      const eventRows = events.map((event) => ({
        context_json: canonicalJson(event.context),
        crawl_id: event.crawlId,
        entity_id: event.entityId,
        entity_type: event.entityType,
        event_id: event.eventId,
        event_type: event.eventType,
        model_slug: event.modelSlug,
        previous_crawl_id: event.previousCrawlId ?? null,
        provider_name: event.providerName ?? null,
        provider_slug: event.providerSlug ?? null,
      }))
      for (const rows of chunk(eventRows, 200)) {
        yield* sql`INSERT INTO entity_events ${sql.insert(rows)}`
      }
      const fieldRows = events.flatMap((event) =>
        event.fields.map((field, ordinal) => ({
          after_json: jsonValue(field.afterPresent, field.after),
          after_present: Number(field.afterPresent),
          before_json: jsonValue(field.beforePresent, field.before),
          before_present: Number(field.beforePresent),
          event_id: event.eventId,
          ordinal,
          path: field.path,
        })),
      )
      for (const rows of chunk(fieldRows, 200)) {
        yield* sql`INSERT INTO event_fields ${sql.insert(rows)}`
      }
    }),
  )
})
