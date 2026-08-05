import { sql } from 'drizzle-orm'
import { check, foreignKey, index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

type ChangeKind = 'available' | 'baseline' | 'unavailable' | 'updated'
type EndpointContextKind = 'entity' | 'none' | 'pricing'
type ModelContextKind = 'entity' | 'none'

/**
 * Drizzle's representation of Area 2's currently implemented v2 SQLite projection.
 *
 * `text({ mode: 'json' })` keeps Area 2's JSON-as-text storage while giving Drizzle typed
 * serialization. `sqliteTable` cannot express the existing `STRICT` table option, so a real
 * migration must retain that clause outside this demonstration.
 */
export const databaseMetadata = sqliteTable('database_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const crawls = sqliteTable(
  'crawls',
  {
    crawlId: text('crawl_id').primaryKey(),
    previousCrawlId: text('previous_crawl_id'),
    processedAt: text('processed_at').notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.previousCrawlId],
      foreignColumns: [table.crawlId],
    }),
  ],
)

export const models = sqliteTable('models', {
  observedCrawlId: text('observed_crawl_id')
    .notNull()
    .references(() => crawls.crawlId),
  slug: text('slug').primaryKey(),
  stateJson: text('state_json', { mode: 'json' }).$type<unknown>().notNull(),
})

export const endpoints = sqliteTable(
  'endpoints',
  {
    id: text('id').primaryKey(),
    modelSlug: text('model_slug').notNull(),
    observedCrawlId: text('observed_crawl_id')
      .notNull()
      .references(() => crawls.crawlId),
    providerName: text('provider_name'),
    providerSlug: text('provider_slug'),
    stateJson: text('state_json', { mode: 'json' }).$type<unknown>().notNull(),
  },
  (table) => [
    index('endpoints_by_model').on(table.modelSlug),
    index('endpoints_by_provider').on(table.providerSlug),
  ],
)

export const modelChanges = sqliteTable(
  'model_changes',
  {
    changeKind: text('change_kind').$type<ChangeKind>().notNull(),
    changesetJson: text('changeset_json', { mode: 'json' }).$type<unknown>().notNull(),
    contextJson: text('context_json', { mode: 'json' }).$type<unknown>(),
    contextKind: text('context_kind').$type<ModelContextKind>().notNull(),
    crawlId: text('crawl_id')
      .notNull()
      .references(() => crawls.crawlId),
    modelName: text('model_name').notNull(),
    modelSlug: text('model_slug').notNull(),
    previousCrawlId: text('previous_crawl_id').references(() => crawls.crawlId),
  },
  (table) => [
    primaryKey({ columns: [table.crawlId, table.modelSlug] }),
    index('model_changes_by_crawl').on(table.crawlId),
    check(
      'model_changes_change_kind_check',
      sql`${table.changeKind} IN ('baseline', 'available', 'unavailable', 'updated')`,
    ),
    check('model_changes_context_kind_check', sql`${table.contextKind} IN ('entity', 'none')`),
    check(
      'model_changes_context_check',
      sql`(${table.contextKind} = 'none' AND ${table.contextJson} IS NULL) OR (${table.contextKind} = 'entity' AND ${table.contextJson} IS NOT NULL)`,
    ),
  ],
)

export const endpointChanges = sqliteTable(
  'endpoint_changes',
  {
    changeKind: text('change_kind').$type<ChangeKind>().notNull(),
    changesetJson: text('changeset_json', { mode: 'json' }).$type<unknown>().notNull(),
    contextJson: text('context_json', { mode: 'json' }).$type<unknown>(),
    contextKind: text('context_kind').$type<EndpointContextKind>().notNull(),
    crawlId: text('crawl_id')
      .notNull()
      .references(() => crawls.crawlId),
    endpointId: text('endpoint_id').notNull(),
    modelName: text('model_name').notNull(),
    modelSlug: text('model_slug').notNull(),
    previousCrawlId: text('previous_crawl_id').references(() => crawls.crawlId),
    providerDisplayName: text('provider_display_name'),
    providerName: text('provider_name'),
    providerSlug: text('provider_slug'),
  },
  (table) => [
    primaryKey({ columns: [table.crawlId, table.endpointId] }),
    index('endpoint_changes_by_crawl').on(table.crawlId),
    index('endpoint_changes_by_model_crawl').on(table.modelSlug, table.crawlId),
    index('endpoint_changes_by_provider_crawl').on(table.providerSlug, table.crawlId),
    check(
      'endpoint_changes_change_kind_check',
      sql`${table.changeKind} IN ('baseline', 'available', 'unavailable', 'updated')`,
    ),
    check(
      'endpoint_changes_context_kind_check',
      sql`${table.contextKind} IN ('entity', 'none', 'pricing')`,
    ),
    check(
      'endpoint_changes_context_check',
      sql`(${table.contextKind} = 'none' AND ${table.contextJson} IS NULL) OR (${table.contextKind} IN ('entity', 'pricing') AND ${table.contextJson} IS NOT NULL)`,
    ),
  ],
)

export const schema = {
  crawls,
  databaseMetadata,
  endpointChanges,
  endpoints,
  modelChanges,
  models,
}
