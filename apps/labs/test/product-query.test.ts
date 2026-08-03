import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { SqliteClient } from '@effect/sql-sqlite-bun'
import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'
import * as Effect from 'effect/Effect'
import type { SqlClient } from 'effect/unstable/sql/SqlClient'

import { initializeDatabase } from '../src/database/schema.ts'
import { commitCrawl } from '../src/database/write.ts'
import { monitorPage } from '../src/product-query/monitor.ts'
import { pricingHistory } from '../src/product-query/pricing.ts'
import { planCrawl } from '../src/projection/plan.ts'
import type { ProjectionBatch, ProjectionState } from '../src/projection/types.ts'

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

const endpoint = (id: string, provider: string, prompt: string): CoreEndpoint => ({
  context_length: 4096,
  data_policy: {},
  features: {},
  has_chat_completions: true,
  has_completions: false,
  id,
  is_deranked: false,
  is_disabled: false,
  is_free: false,
  max_completion_tokens: 1024,
  max_prompt_tokens: 3072,
  model_variant_permaslug: model.permaslug,
  model_variant_slug: model.slug,
  moderation_required: false,
  pricing: { completion: '0.000002', prompt },
  provider_display_name: `${provider} display`,
  provider_model_id: 'model',
  provider_name: provider,
  provider_region: null,
  provider_slug: provider,
  quantization: null,
  supported_parameters: ['tools'],
  supports_reasoning: false,
  supports_tool_parameters: true,
  variant: 'standard',
})

const batch = (crawlId: string, endpoints: readonly CoreEndpoint[]): ProjectionBatch => ({
  crawlId,
  endpoints: endpoints.map((item) => ({
    endpoint: item,
    metrics: undefined,
    modelSlug: model.slug,
  })),
  models: [model],
})

const withDatabase = async <A>(run: Effect.Effect<A, unknown, SqlClient>) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-labs-query-'))
  directories.push(directory)
  const filename = path.join(directory, 'products.sqlite')
  return await Effect.runPromise(
    Effect.gen(function* prepare() {
      yield* initializeDatabase()
      let state: ProjectionState = { endpoints: new Map(), models: new Map() }
      let previousCrawlId: string | undefined
      const crawls = [
        batch('1000', [endpoint('a', 'provider-a', '1'), endpoint('b', 'provider-b', '9')]),
        batch('2000', [endpoint('a', 'provider-a', '2'), endpoint('b', 'provider-b', '9')]),
        batch('3000', [endpoint('b', 'provider-b', '9')]),
        batch('4000', [endpoint('a', 'provider-a', '3'), endpoint('b', 'provider-b', '9')]),
      ]
      for (const crawl of crawls) {
        const plan = planCrawl(state, crawl, previousCrawlId)
        yield* commitCrawl(plan)
        state = plan.after
        previousCrawlId = crawl.crawlId
      }
      return yield* run
    }).pipe(Effect.provide(SqliteClient.layer({ disableWAL: true, filename }))),
  )
}

describe('product queries', () => {
  test('pages complete Monitor batches after filtered crawl discovery', async () => {
    const page = await withDatabase(monitorPage({ limit: 1, providerName: 'provider-a' }))
    expect(page.nextBefore).toBe('4000')
    expect(page.batches.map((item) => item.crawlId)).toEqual(['4000'])
    expect(page.batches[0]?.events.map((event) => event.entityId)).toEqual(['a'])

    const firstPage = await withDatabase(
      monitorPage({ before: '2000', limit: 1, providerName: 'provider-a' }),
    )
    expect(firstPage.batches[0]?.events.map((event) => event.entityId)).toEqual([
      'a',
      'b',
      'author/model',
    ])
  })

  test('starts a fresh pricing series after each availability gap', async () => {
    const history = await withDatabase(pricingHistory(model.slug))
    expect(history).toMatchObject({ asOf: 4000, modelSlug: model.slug, since: 1000 })
    expect(history.series).toHaveLength(3)

    const endpointPeriods = history.series.filter((series) => series.endpointId === 'a')
    expect(endpointPeriods).toHaveLength(2)
    expect(endpointPeriods[0]).toMatchObject({ availableFrom: 1000, unavailableAt: 3000 })
    expect(endpointPeriods[0]?.points).toEqual([
      { at: 1000, available: true, pricing: { completion: '0.000002', prompt: '1' } },
      { at: 2000, available: true, pricing: { prompt: '2' } },
      { at: 3000, available: false, pricing: {} },
    ])
    expect(endpointPeriods[1]?.points).toEqual([
      { at: 4000, available: true, pricing: { completion: '0.000002', prompt: '3' } },
    ])
    expect(endpointPeriods[1]).toMatchObject({ availableFrom: 4000 })
  })
})
