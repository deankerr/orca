import { Database } from 'bun:sqlite'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { CoreModel } from '@orca/schema/archive-core.ts'
import * as Effect from 'effect/Effect'

import {
  ArchiveError,
  DEFAULT_EXPORT_DIRECTORY,
  DEFAULT_WORK_DIRECTORY,
  attempt,
  readCrawls,
} from '../archive.ts'
import type { CoreBatch, MaterializedEndpoint } from '../core-sqlite.ts'
import { materializeCore } from '../core-sqlite.ts'
import { canonicalJson, createEvent } from './diff.ts'
import type { EntityEvent } from './diff.ts'

interface ReplayOptions {
  readonly databasePath?: string
  readonly exportDirectory?: string
  readonly limit?: number
}

const schemaSql = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE crawls (crawl_id TEXT PRIMARY KEY, previous_crawl_id TEXT, endpoint_fetch_failures INTEGER NOT NULL, processed_at TEXT NOT NULL) STRICT;
CREATE TABLE models (slug TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_crawl_id TEXT NOT NULL) STRICT;
CREATE TABLE endpoints (id TEXT PRIMARY KEY, model_slug TEXT NOT NULL, provider_name TEXT NOT NULL, provider_slug TEXT NOT NULL, state_json TEXT NOT NULL, updated_crawl_id TEXT NOT NULL) STRICT;
CREATE INDEX endpoints_by_model ON endpoints(model_slug);
CREATE INDEX endpoints_by_provider ON endpoints(provider_name);
CREATE TABLE endpoint_metrics (endpoint_id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, p50_latency REAL, p50_throughput REAL) STRICT;
CREATE TABLE entity_events (event_id TEXT PRIMARY KEY, crawl_id TEXT NOT NULL, previous_crawl_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL, model_slug TEXT NOT NULL, provider_name TEXT, provider_slug TEXT, context_json TEXT NOT NULL) STRICT;
CREATE INDEX events_by_crawl ON entity_events(crawl_id DESC);
CREATE INDEX events_by_model_crawl ON entity_events(model_slug, crawl_id DESC);
CREATE INDEX events_by_provider_crawl ON entity_events(provider_name, crawl_id DESC);
CREATE TABLE event_fields (event_id TEXT NOT NULL, ordinal INTEGER NOT NULL, path TEXT NOT NULL, before_present INTEGER NOT NULL, before_json TEXT, after_present INTEGER NOT NULL, after_json TEXT, PRIMARY KEY(event_id, ordinal), FOREIGN KEY(event_id) REFERENCES entity_events(event_id)) STRICT;
CREATE INDEX event_fields_by_path ON event_fields(path, event_id);
`

export interface ReplayState {
  readonly models: Map<string, CoreModel>
  readonly endpoints: Map<string, MaterializedEndpoint>
}

export const advanceState = (previous: ReplayState, batch: CoreBatch): ReplayState => {
  const models = new Map(batch.models.map((model) => [model.slug, model]))
  const endpoints = new Map(batch.endpoints.map((item) => [item.endpoint.id, item]))
  for (const [slug, model] of previous.models) {
    if (batch.failedModelSlugs.has(slug)) {
      models.set(slug, model)
    }
  }
  for (const [id, item] of previous.endpoints) {
    if (batch.failedModelSlugs.has(item.modelSlug)) {
      endpoints.set(id, item)
    }
  }
  return { endpoints, models }
}

export const diffStates = (
  before: ReplayState,
  after: ReplayState,
  crawlId: string,
  previousCrawlId?: string,
) => {
  const events: EntityEvent[] = []
  const modelSlugs = new Set([...before.models.keys(), ...after.models.keys()])
  for (const slug of [...modelSlugs].toSorted()) {
    const event = createEvent({
      after: after.models.get(slug),
      before: before.models.get(slug),
      crawlId,
      identity: { entityId: slug, entityType: 'model', modelSlug: slug },
      previousCrawlId,
    })
    if (event !== undefined) {
      events.push(event)
    }
  }
  const endpointIds = new Set([...before.endpoints.keys(), ...after.endpoints.keys()])
  for (const id of [...endpointIds].toSorted()) {
    const oldItem = before.endpoints.get(id)
    const newItem = after.endpoints.get(id)
    const item = newItem ?? oldItem
    if (item === undefined) {
      continue
    }
    const { endpoint } = item
    const event = createEvent({
      after: newItem?.endpoint,
      before: oldItem?.endpoint,
      crawlId,
      identity: {
        entityId: id,
        entityType: 'endpoint',
        modelSlug: item.modelSlug,
        providerName: endpoint.provider_name,
        providerSlug: endpoint.provider_slug,
      },
      previousCrawlId,
    })
    if (event !== undefined) {
      events.push(event)
    }
  }
  return events
}

const jsonValue = (present: boolean, value: unknown) => (present ? canonicalJson(value) : null)

const writeCrawl = (
  database: Database,
  batch: CoreBatch,
  before: ReplayState,
  after: ReplayState,
  previousCrawlId?: string,
) => {
  const events = diffStates(before, after, batch.crawlId, previousCrawlId)
  const insertEvent = database.prepare(
    'INSERT INTO entity_events VALUES ($event_id,$crawl_id,$previous_crawl_id,$entity_type,$entity_id,$event_type,$model_slug,$provider_name,$provider_slug,$context_json)',
  )
  const insertField = database.prepare('INSERT INTO event_fields VALUES (?,?,?,?,?,?,?)')
  const upsertModel = database.prepare(
    'INSERT INTO models VALUES (?,?,?) ON CONFLICT(slug) DO UPDATE SET state_json=excluded.state_json, updated_crawl_id=excluded.updated_crawl_id',
  )
  const upsertEndpoint = database.prepare(
    'INSERT INTO endpoints VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET model_slug=excluded.model_slug, provider_name=excluded.provider_name, provider_slug=excluded.provider_slug, state_json=excluded.state_json, updated_crawl_id=excluded.updated_crawl_id',
  )
  database.transaction(() => {
    database.run('INSERT INTO crawls VALUES (?,?,?,?)', [
      batch.crawlId,
      previousCrawlId ?? null,
      batch.endpointFetchFailures,
      new Date(Number(batch.crawlId)).toISOString(),
    ])
    // The event stream drives the current projection. This both proves the events are sufficient
    // and avoids rewriting hundreds of unchanged rows on every crawl.
    for (const event of events) {
      if (event.entityType === 'model') {
        if (event.eventType === 'unavailable') {
          database.run('DELETE FROM models WHERE slug = ?', [event.entityId])
        } else {
          upsertModel.run(event.entityId, canonicalJson(event.context), event.crawlId)
        }
      } else if (event.eventType === 'unavailable') {
        database.run('DELETE FROM endpoints WHERE id = ?', [event.entityId])
      } else {
        upsertEndpoint.run(
          event.entityId,
          event.modelSlug,
          event.providerName ?? null,
          event.providerSlug ?? null,
          canonicalJson(event.context),
          event.crawlId,
        )
      }
    }
    for (const id of before.endpoints.keys()) {
      if (!after.endpoints.has(id)) {
        database.run('DELETE FROM endpoint_metrics WHERE endpoint_id = ?', [id])
      }
    }
    for (const item of batch.endpoints) {
      database.run('DELETE FROM endpoint_metrics WHERE endpoint_id = ?', [item.endpoint.id])
      if (item.metrics !== undefined) {
        database.run('INSERT INTO endpoint_metrics VALUES (?,?,?,?)', [
          item.endpoint.id,
          batch.crawlId,
          item.metrics.p50_latency ?? null,
          item.metrics.p50_throughput ?? null,
        ])
      }
    }
    for (const event of events) {
      insertEvent.run({
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
      })
      for (const [ordinal, field] of event.fields.entries()) {
        insertField.run(
          event.eventId,
          ordinal,
          field.path,
          Number(field.beforePresent),
          jsonValue(field.beforePresent, field.before),
          Number(field.afterPresent),
          jsonValue(field.afterPresent, field.after),
        )
      }
    }
  })()
  return events.length
}

export const replayHistory = Effect.fn(function* replayHistory(options: ReplayOptions = {}) {
  const exportDirectory = options.exportDirectory ?? DEFAULT_EXPORT_DIRECTORY
  const databasePath =
    options.databasePath ?? `${DEFAULT_WORK_DIRECTORY}/history/core-history.sqlite`
  const allCrawls = yield* readCrawls(exportDirectory)
  const crawls = options.limit === undefined ? allCrawls : allCrawls.slice(0, options.limit)
  if (crawls.length === 0) {
    return yield* Effect.fail(new ArchiveError('history replay has no crawls'))
  }
  return yield* attempt('replay core history', async () => {
    await mkdir(path.dirname(databasePath), { recursive: true })
    await rm(databasePath, { force: true })
    const database = new Database(databasePath, { create: true, strict: true })
    database.run(schemaSql)
    let state: ReplayState = { endpoints: new Map(), models: new Map() }
    let previousCrawlId: string | undefined
    let eventCount = 0
    for (const crawl of crawls) {
      const compressed = await Bun.file(`${exportDirectory}/_storage/${crawl.storage_id}`).bytes()
      const batch = materializeCore(
        JSON.parse(new TextDecoder().decode(Bun.gunzipSync(compressed))),
      )
      const after = advanceState(state, batch)
      eventCount += writeCrawl(database, batch, state, after, previousCrawlId)
      state = after
      previousCrawlId = batch.crawlId
    }
    database.run('PRAGMA optimize')
    database.close()
    return {
      crawls: crawls.length,
      databasePath,
      endpoints: state.endpoints.size,
      events: eventCount,
      models: state.models.size,
    }
  })
})
