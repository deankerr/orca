import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { SqliteClient } from '@effect/sql-sqlite-bun'
import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'
import * as Core from '@orca/schema/archive-core.ts'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { encodeGzipBundle } from '../src/bundle-archive/encoding.ts'
import { initializeBundleArchive } from '../src/bundle-archive/schema.ts'
import { appendBundle } from '../src/bundle-archive/storage.ts'
import { replayProductDatabase } from '../src/database/build.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true })
    }),
  )
})

const model = {
  author: 'author',
  context_length: 4096,
  created_at: '2025-01-01T00:00:00Z',
  description: 'Description',
  group: 'tokenizer',
  hf_slug: null,
  input_modalities: ['text'],
  instruct_type: null,
  name: 'Model',
  output_modalities: ['text'],
  permaslug: 'author/model-20250101',
  reasoning_config: null,
  short_name: 'Model',
  slug: 'author/model',
  warning_message: null,
} satisfies CoreModel

const endpoint = {
  context_length: 4096,
  data_policy: {},
  features: {},
  has_chat_completions: true,
  has_completions: false,
  id: 'endpoint-id',
  is_deranked: false,
  is_disabled: false,
  is_free: false,
  max_completion_tokens: 1024,
  max_prompt_tokens: 3072,
  model_variant_permaslug: 'author/model-20250101',
  model_variant_slug: 'author/model',
  moderation_required: false,
  pricing: { completion: '0.000002', prompt: '0.000001' },
  provider_display_name: 'Provider',
  provider_model_id: 'model',
  provider_name: 'provider',
  provider_region: null,
  provider_slug: 'provider',
  quantization: null,
  supported_parameters: ['tools'],
  supports_reasoning: false,
  supports_tool_parameters: true,
  variant: 'standard',
} satisfies CoreEndpoint

const bundle = (crawlId: string, price: string) => ({
  crawl_id: crawlId,
  data: {
    models: [
      {
        endpoints: [
          {
            ...endpoint,
            model,
            pricing: { ...endpoint.pricing, prompt: price },
            stats: { p50_latency: 100, p50_throughput: 20 },
          },
        ],
        model,
      },
    ],
  },
})

const writeArchive = async (
  directory: string,
  values: readonly {
    readonly crawl_id: string
    readonly data: { readonly models: readonly unknown[] }
  }[] = [bundle('1', '0.000001'), bundle('2', '0.000003')],
) => {
  const archivePath = path.join(directory, 'bundles.sqlite')
  await Effect.runPromise(
    Effect.gen(function* writeTestArchive() {
      yield* initializeBundleArchive()
      for (const value of values) {
        const crawlId = value.crawl_id
        const encoded = yield* encodeGzipBundle({
          compressionLevel: 1,
          crawlId,
          source: Bun.gzipSync(JSON.stringify(value)),
          sourceKind: 'convex',
          sourceMetadataJson: '{}',
          sourceRef: `test/${crawlId}`,
        })
        yield* appendBundle(encoded)
      }
    }).pipe(Effect.provide(SqliteClient.layer({ filename: archivePath })), Effect.scoped),
  )
  return archivePath
}

describe('raw archive database build', () => {
  test('replays current state and historically valid product events through Effect SQL', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-db-'))
    directories.push(directory)
    const archivePath = await writeArchive(directory)
    const outputPath = path.join(directory, 'products.sqlite')

    const result = await Effect.runPromise(
      replayProductDatabase({ archivePath, outputPath, precision: 'full' }),
    )
    expect(result).toMatchObject({ crawls: 2, endpoints: 1, events: 3, models: 1 })

    const rows = await Effect.runPromise(
      Effect.gen(function* queryDatabase() {
        const sql = yield* SqlClient.SqlClient
        const [current] = yield* sql<{ state_json: string }>`SELECT state_json FROM endpoints`
        const events = yield* sql<{
          context_json: string
          crawl_id: string
          entity_type: string
          event_type: string
        }>`SELECT crawl_id, entity_type, event_type, context_json FROM entity_events ORDER BY crawl_id, entity_type`
        const fields = yield* sql<{ path: string }>`SELECT path FROM event_fields`
        const metrics = yield* sql<{ crawl_id: string }>`SELECT crawl_id FROM endpoint_metrics`
        const metadata = yield* sql<{
          key: string
          value: string
        }>`SELECT key, value FROM database_metadata ORDER BY key`
        return { current, events, fields, metadata, metrics }
      }).pipe(
        Effect.provide(
          SqliteClient.layer({ disableWAL: true, filename: outputPath, readonly: true }),
        ),
      ),
    )

    const currentEndpoint = Schema.decodeUnknownSync(Schema.fromJsonString(Core.CoreEndpoint))(
      rows.current?.state_json ?? '{}',
    )
    expect(currentEndpoint.pricing.prompt).toBe('0.000003')
    expect(
      rows.events.map(({ crawl_id, entity_type, event_type }) => ({
        crawl_id,
        entity_type,
        event_type,
      })),
    ).toEqual([
      { crawl_id: '1', entity_type: 'endpoint', event_type: 'baseline' },
      { crawl_id: '1', entity_type: 'model', event_type: 'baseline' },
      { crawl_id: '2', entity_type: 'endpoint', event_type: 'updated' },
    ])
    const endpointContext = Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({
          endpoint: Core.CoreEndpoint,
          model: Schema.Struct({ name: Schema.String, slug: Schema.String }),
        }),
      ),
    )(rows.events[0]?.context_json ?? '{}')
    expect(endpointContext.model).toEqual({ name: 'Model', slug: 'author/model' })
    expect(rows.fields).toEqual([{ path: 'pricing.prompt' }])
    expect(rows.metrics).toEqual([{ crawl_id: '2' }])
    expect(rows.metadata).toEqual([
      { key: 'historical_precision', value: 'full' },
      { key: 'processor_version', value: 'core-v2' },
    ])
  })

  test('supports a bounded demo build', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-db-'))
    directories.push(directory)
    const archivePath = await writeArchive(directory)
    const outputPath = path.join(directory, 'demo.sqlite')

    const result = await Effect.runPromise(
      replayProductDatabase({ archivePath, limit: 1, outputPath }),
    )
    expect(result).toMatchObject({ crawls: 1, events: 2 })
  })

  test('applies the limit after read-time bundle exclusions', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-db-'))
    directories.push(directory)
    const archivePath = await writeArchive(directory, [
      { crawl_id: '1', data: { models: [] } },
      bundle('2', '0.000001'),
    ])
    const outputPath = path.join(directory, 'after-empty.sqlite')

    const result = await Effect.runPromise(
      replayProductDatabase({ archivePath, limit: 1, outputPath, precision: 'full' }),
    )
    expect(result).toMatchObject({ acceptedCrawls: 1, crawls: 1, sourceBundlesRead: 2 })

    const crawls = await Effect.runPromise(
      Effect.gen(function* readCrawls() {
        const sql = yield* SqlClient.SqlClient
        return yield* sql<{ crawl_id: string }>`SELECT crawl_id FROM crawls`
      }).pipe(
        Effect.provide(
          SqliteClient.layer({ disableWAL: true, filename: outputPath, readonly: true }),
        ),
      ),
    )
    expect(crawls).toEqual([{ crawl_id: '2' }])
  })

  test('selects the daily candidate before decoding the core schema', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-db-'))
    directories.push(directory)
    const archivePath = await writeArchive(directory, [
      {
        crawl_id: '1',
        data: {
          models: [
            {
              endpoints: [{ id: 'incomplete', model: { output_modalities: ['text'] } }],
              model: { output_modalities: ['text'] },
            },
          ],
        },
      },
      bundle('2', '0.000001'),
    ])
    const outputPath = path.join(directory, 'daily-candidate.sqlite')

    const result = await Effect.runPromise(replayProductDatabase({ archivePath, outputPath }))
    expect(result).toMatchObject({ acceptedCrawls: 2, crawls: 1, sourceBundlesRead: 2 })
  })

  test('falls back to the last usable daily candidate', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-db-'))
    directories.push(directory)
    const archivePath = await writeArchive(directory, [
      bundle('1', '0.000001'),
      { crawl_id: '2', data: { models: [] } },
    ])
    const outputPath = path.join(directory, 'daily-fallback.sqlite')

    const result = await Effect.runPromise(replayProductDatabase({ archivePath, outputPath }))
    expect(result).toMatchObject({ acceptedCrawls: 1, crawls: 1, sourceBundlesRead: 2 })

    const crawls = await Effect.runPromise(
      Effect.gen(function* readCrawls() {
        const sql = yield* SqlClient.SqlClient
        return yield* sql<{ crawl_id: string }>`SELECT crawl_id FROM crawls`
      }).pipe(
        Effect.provide(
          SqliteClient.layer({ disableWAL: true, filename: outputPath, readonly: true }),
        ),
      ),
    )
    expect(crawls).toEqual([{ crawl_id: '1' }])
  })
})
