import { Database } from 'bun:sqlite'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'
import * as Core from '@orca/schema/archive-core.ts'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import {
  ArchiveError,
  DEFAULT_EXPORT_DIRECTORY,
  DEFAULT_WORK_DIRECTORY,
  attempt,
  readCrawls,
} from './archive.ts'

type JsonRecord = Record<string, unknown>

export interface MaterializedEndpoint {
  readonly endpoint: CoreEndpoint
  readonly metrics: { readonly p50_latency?: number; readonly p50_throughput?: number } | undefined
  readonly modelSlug: string
}

export interface CoreBatch {
  readonly crawlId: string
  readonly endpointFetchFailures: number
  readonly endpoints: readonly MaterializedEndpoint[]
  readonly models: readonly CoreModel[]
  /** Text-model scopes whose endpoint request failed and must retain their prior endpoint state. */
  readonly failedModelSlugs: ReadonlySet<string>
}

interface SqliteOptions {
  readonly crawlId: string
  readonly databasePath?: string
  readonly exportDirectory?: string
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isTextOutput = (model: JsonRecord) => {
  const modalities = model.output_modalities
  return Array.isArray(modalities) && modalities.length === 1 && modalities[0] === 'text'
}

const decodeModel = Schema.decodeUnknownSync(Core.CoreModel)
const decodeEndpoint = Schema.decodeUnknownSync(Core.CoreEndpoint)

const readMetrics = (endpoint: JsonRecord): MaterializedEndpoint['metrics'] => {
  const { stats } = endpoint
  if (!isRecord(stats)) {
    return undefined
  }

  const latency = stats.p50_latency
  const throughput = stats.p50_throughput
  const metrics = {
    ...(typeof latency === 'number' ? { p50_latency: latency } : {}),
    ...(typeof throughput === 'number' ? { p50_throughput: throughput } : {}),
  }
  return Object.keys(metrics).length === 0 ? undefined : metrics
}

// Pure entity work: validate only our opted-in core, deduplicate upstream copies, and retain raw
// names. Endpoint-fetch error objects are counted separately and never become empty observations.
export const materializeCore = (value: unknown): CoreBatch => {
  if (!isRecord(value) || typeof value.crawl_id !== 'string' || !isRecord(value.data)) {
    throw new ArchiveError('expected a crawl bundle object')
  }
  if (!Array.isArray(value.data.models)) {
    throw new ArchiveError(`crawl ${value.crawl_id} has no model array`)
  }

  const models = new Map<string, CoreModel>()
  const endpoints = new Map<string, MaterializedEndpoint>()
  const failedModelSlugs = new Set<string>()
  let endpointFetchFailures = 0

  for (const entry of value.data.models) {
    if (!isRecord(entry) || !isRecord(entry.model)) {
      throw new ArchiveError(`crawl ${value.crawl_id} contains a malformed model scope`)
    }
    if (!isTextOutput(entry.model)) {
      continue
    }

    const scopeModel = decodeModel(entry.model)

    if (!Array.isArray(entry.endpoints)) {
      endpointFetchFailures += 1
      failedModelSlugs.add(scopeModel.slug)
      continue
    }

    for (const rawEndpoint of entry.endpoints) {
      if (!isRecord(rawEndpoint) || !isRecord(rawEndpoint.model)) {
        throw new ArchiveError(`crawl ${value.crawl_id} contains a malformed endpoint`)
      }
      if (!isTextOutput(rawEndpoint.model)) {
        continue
      }
      const model = decodeModel(rawEndpoint.model)
      const endpoint = decodeEndpoint(rawEndpoint)
      models.set(model.slug, model)
      endpoints.set(endpoint.id, {
        endpoint,
        metrics: readMetrics(rawEndpoint),
        modelSlug: model.slug,
      })
    }
  }

  return {
    crawlId: value.crawl_id,
    endpointFetchFailures,
    endpoints: [...endpoints.values()],
    failedModelSlugs,
    models: [...models.values()],
  }
}

const schemaSql = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE batch (
    crawl_id TEXT PRIMARY KEY,
    endpoint_fetch_failures INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE models (
    crawl_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    permaslug TEXT NOT NULL,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    context_length INTEGER NOT NULL,
    input_modalities TEXT NOT NULL,
    output_modalities TEXT NOT NULL,
    "group" TEXT NOT NULL,
    hf_slug TEXT,
    instruct_type TEXT,
    reasoning_config TEXT,
    supports_reasoning INTEGER,
    promotion_message TEXT,
    warning_message TEXT,
    PRIMARY KEY (crawl_id, slug)
  ) STRICT;
  CREATE TABLE endpoints (
    crawl_id TEXT NOT NULL,
    id TEXT NOT NULL,
    model_slug TEXT NOT NULL,
    model_variant_slug TEXT NOT NULL,
    model_variant_permaslug TEXT NOT NULL,
    variant TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    provider_display_name TEXT NOT NULL,
    provider_slug TEXT NOT NULL,
    provider_model_id TEXT NOT NULL,
    provider_region TEXT,
    context_length INTEGER NOT NULL,
    max_prompt_tokens INTEGER,
    max_completion_tokens INTEGER,
    quantization TEXT,
    supported_parameters TEXT NOT NULL,
    pricing TEXT NOT NULL,
    data_policy TEXT NOT NULL,
    features TEXT NOT NULL,
    supports_reasoning INTEGER NOT NULL,
    supports_tool_parameters INTEGER NOT NULL,
    has_chat_completions INTEGER NOT NULL,
    has_completions INTEGER NOT NULL,
    moderation_required INTEGER NOT NULL,
    is_free INTEGER NOT NULL,
    is_deranked INTEGER NOT NULL,
    is_disabled INTEGER NOT NULL,
    PRIMARY KEY (crawl_id, id)
  ) STRICT;
  CREATE INDEX endpoints_by_model ON endpoints (model_slug);
  CREATE INDEX endpoints_by_provider ON endpoints (provider_name);
  CREATE TABLE endpoint_metrics (
    crawl_id TEXT NOT NULL,
    endpoint_id TEXT NOT NULL,
    p50_latency REAL,
    p50_throughput REAL,
    PRIMARY KEY (crawl_id, endpoint_id)
  ) STRICT;
`

const writeDatabase = (databasePath: string, batch: CoreBatch) => {
  const database = new Database(databasePath, { create: true, strict: true })
  database.run(schemaSql)

  const insertBatch = database.prepare('INSERT INTO batch VALUES (?, ?)')
  const insertModel = database.prepare(`
    INSERT INTO models VALUES (
      $crawl_id, $slug, $permaslug, $name, $short_name, $description, $author, $created_at,
      $context_length, $input_modalities, $output_modalities, $group, $hf_slug, $instruct_type,
      $reasoning_config, $supports_reasoning, $promotion_message, $warning_message
    )
  `)
  const insertEndpoint = database.prepare(`
    INSERT INTO endpoints VALUES (
      $crawl_id, $id, $model_slug, $model_variant_slug, $model_variant_permaslug, $variant,
      $provider_name, $provider_display_name, $provider_slug, $provider_model_id, $provider_region,
      $context_length, $max_prompt_tokens, $max_completion_tokens, $quantization,
      $supported_parameters, $pricing, $data_policy, $features, $supports_reasoning,
      $supports_tool_parameters, $has_chat_completions, $has_completions, $moderation_required,
      $is_free, $is_deranked, $is_disabled
    )
  `)
  const insertMetrics = database.prepare('INSERT INTO endpoint_metrics VALUES (?, ?, ?, ?)')

  database.transaction(() => {
    insertBatch.run(batch.crawlId, batch.endpointFetchFailures)
    for (const model of batch.models) {
      insertModel.run({
        author: model.author,
        context_length: model.context_length,
        crawl_id: batch.crawlId,
        created_at: model.created_at,
        description: model.description,
        group: model.group,
        hf_slug: model.hf_slug,
        input_modalities: JSON.stringify(model.input_modalities),
        instruct_type: model.instruct_type,
        name: model.name,
        output_modalities: JSON.stringify(model.output_modalities),
        permaslug: model.permaslug,
        promotion_message: model.promotion_message ?? null,
        reasoning_config: JSON.stringify(model.reasoning_config),
        short_name: model.short_name,
        slug: model.slug,
        supports_reasoning: model.supports_reasoning ?? null,
        warning_message: model.warning_message,
      })
    }
    for (const item of batch.endpoints) {
      const { endpoint } = item
      insertEndpoint.run({
        ...endpoint,
        crawl_id: batch.crawlId,
        data_policy: JSON.stringify(endpoint.data_policy),
        features: JSON.stringify(endpoint.features),
        model_slug: item.modelSlug,
        pricing: JSON.stringify(endpoint.pricing),
        supported_parameters: JSON.stringify(endpoint.supported_parameters),
      })
      if (item.metrics !== undefined) {
        insertMetrics.run(
          batch.crawlId,
          endpoint.id,
          item.metrics.p50_latency ?? null,
          item.metrics.p50_throughput ?? null,
        )
      }
    }
  })()
  database.run('PRAGMA optimize')
  database.close()
}

export const materializeSqlite = Effect.fn(function* materializeSqlite(options: SqliteOptions) {
  const exportDirectory = options.exportDirectory ?? DEFAULT_EXPORT_DIRECTORY
  const databasePath =
    options.databasePath ?? `${DEFAULT_WORK_DIRECTORY}/sql/core-${options.crawlId}.sqlite`
  const crawls = yield* readCrawls(exportDirectory)
  const crawl = crawls.find((candidate) => candidate.crawl_id === options.crawlId)
  if (crawl === undefined) {
    return yield* Effect.fail(new ArchiveError(`crawl ${options.crawlId} does not exist`))
  }

  return yield* attempt('materialize core SQLite database', async () => {
    const compressed = await Bun.file(`${exportDirectory}/_storage/${crawl.storage_id}`).bytes()
    const batch = materializeCore(JSON.parse(new TextDecoder().decode(Bun.gunzipSync(compressed))))
    await mkdir(path.dirname(databasePath), { recursive: true })
    await rm(databasePath, { force: true })
    writeDatabase(databasePath, batch)
    return { batch, databasePath }
  })
})
