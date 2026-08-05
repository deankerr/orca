import { asc, desc, sql } from 'drizzle-orm'
import type { SQLiteBunDatabase } from 'drizzle-orm/bun-sqlite'
import { unionAll } from 'drizzle-orm/sqlite-core'
import * as Effect from 'effect/Effect'

import { ProductDatabaseError } from './errors.ts'
import * as Schema from './schema.ts'

/** One model or endpoint change in the chronological monitor feed. */
export interface MonitorEvent {
  readonly changeKind: 'available' | 'baseline' | 'unavailable' | 'updated'
  readonly changeset: unknown
  readonly context: unknown
  readonly contextKind: 'entity' | 'none' | 'pricing'
  readonly crawlId: string
  readonly entityId: string
  readonly entityType: 'endpoint' | 'model'
  readonly modelName: string
  readonly modelSlug: string
  readonly providerDisplayName: string | undefined
  readonly providerName: string | undefined
  readonly providerSlug: string | undefined
}

interface MonitorRow {
  readonly changeKind: MonitorEvent['changeKind']
  readonly changeset: unknown
  readonly context: unknown
  readonly contextKind: MonitorEvent['contextKind']
  readonly crawlId: string
  readonly crawlOrder: number
  readonly entityId: string
  readonly entityType: MonitorEvent['entityType']
  readonly modelName: string
  readonly modelSlug: string
  readonly providerDisplayName: string | null
  readonly providerName: string | null
  readonly providerSlug: string | null
}

/**
 * Reads the most recent cross-entity change feed using the same union and ordering policy as
 * Area 2's static monitor. Drizzle maps the JSON-text columns before this result is returned.
 */
export const queryRecentMonitorEvents = (database: SQLiteBunDatabase, limit: number) =>
  Effect.try({
    catch: (cause) => new ProductDatabaseError({ cause }),
    try: () => {
      const modelEvents = database
        .select({
          changeKind: Schema.modelChanges.changeKind,
          changeset: Schema.modelChanges.changesetJson,
          context: Schema.modelChanges.contextJson,
          contextKind: sql<MonitorEvent['contextKind']>`${Schema.modelChanges.contextKind}`.as(
            'context_kind',
          ),
          crawlId: Schema.modelChanges.crawlId,
          crawlOrder: sql<number>`CAST(${Schema.modelChanges.crawlId} AS INTEGER)`.as(
            'crawl_order',
          ),
          entityId: sql<string>`${Schema.modelChanges.modelSlug}`.as('entity_id'),
          entityType: sql<MonitorEvent['entityType']>`'model'`.as('entity_type'),
          modelName: Schema.modelChanges.modelName,
          modelSlug: Schema.modelChanges.modelSlug,
          providerDisplayName: sql<string | null>`NULL`.as('provider_display_name'),
          providerName: sql<string | null>`NULL`.as('provider_name'),
          providerSlug: sql<string | null>`NULL`.as('provider_slug'),
        })
        .from(Schema.modelChanges)
      const endpointEvents = database
        .select({
          changeKind: Schema.endpointChanges.changeKind,
          changeset: Schema.endpointChanges.changesetJson,
          context: Schema.endpointChanges.contextJson,
          contextKind: sql<MonitorEvent['contextKind']>`${Schema.endpointChanges.contextKind}`.as(
            'context_kind',
          ),
          crawlId: Schema.endpointChanges.crawlId,
          crawlOrder: sql<number>`CAST(${Schema.endpointChanges.crawlId} AS INTEGER)`.as(
            'crawl_order',
          ),
          entityId: sql<string>`${Schema.endpointChanges.endpointId}`.as('entity_id'),
          entityType: sql<MonitorEvent['entityType']>`'endpoint'`.as('entity_type'),
          modelName: Schema.endpointChanges.modelName,
          modelSlug: Schema.endpointChanges.modelSlug,
          providerDisplayName: Schema.endpointChanges.providerDisplayName,
          providerName: Schema.endpointChanges.providerName,
          providerSlug: Schema.endpointChanges.providerSlug,
        })
        .from(Schema.endpointChanges)
      const rows = unionAll(modelEvents, endpointEvents)
        .orderBy(desc(sql`crawl_order`), asc(sql`entity_type`), asc(sql`entity_id`))
        .limit(limit)
        .all()

      return rows.map((row): MonitorEvent => {
        const event: MonitorRow = row
        return {
          changeKind: event.changeKind,
          changeset: event.changeset,
          context: event.context ?? undefined,
          contextKind: event.contextKind,
          crawlId: event.crawlId,
          entityId: event.entityId,
          entityType: event.entityType,
          modelName: event.modelName,
          modelSlug: event.modelSlug,
          providerDisplayName: event.providerDisplayName ?? undefined,
          providerName: event.providerName ?? undefined,
          providerSlug: event.providerSlug ?? undefined,
        }
      })
    },
  })
