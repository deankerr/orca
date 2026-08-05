import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { CoreEndpoint, CoreModel } from '@orca/schema/area-2-core.ts'

import type { MaterializedCrawl, MaterializedEndpoint } from '../materialize.ts'
import { readPricingHistory } from '../pricing-history.ts'
import { ProductDatabase } from '../product-database.ts'

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true })
  }
})

const model = (name = 'Model'): CoreModel => ({
  author: 'author',
  context_length: 4096,
  created_at: '2025-01-01T00:00:00Z',
  description: 'Description',
  group: 'tokenizer',
  hf_slug: null,
  input_modalities: ['text'],
  instruct_type: null,
  name,
  output_modalities: ['text'],
  permaslug: 'author/model-20250101',
  reasoning_config: null,
  short_name: 'Model',
  slug: 'author/model',
  warning_message: null,
})

const endpoint = (
  prompt: string,
  supportedParameters = ['tools'],
  pricing?: CoreEndpoint['pricing'],
): MaterializedEndpoint => {
  const endpointPricing = pricing ?? { completion: '0.000002', prompt }
  return {
    endpoint: {
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
      pricing: endpointPricing,
      provider_display_name: 'Provider',
      provider_model_id: 'model',
      provider_name: 'Provider',
      provider_region: null,
      provider_slug: 'provider',
      quantization: null,
      supported_parameters: supportedParameters,
      supports_reasoning: false,
      supports_tool_parameters: true,
      variant: 'standard',
    } satisfies CoreEndpoint,
    metrics: undefined,
    modelSlug: 'author/model',
  }
}

const crawl = (
  crawlId: string,
  endpoints: readonly MaterializedEndpoint[],
  models: MaterializedCrawl['models'] = [model()],
): MaterializedCrawl => ({ crawlId, endpoints, models })

describe('Area 2 product database', () => {
  test('rejects an existing database with a different projection version', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-area-2-'))
    directories.push(directory)
    const filename = path.join(directory, 'products.sqlite')

    ProductDatabase.open(filename).close()
    const sql = new Database(filename)
    sql
      .query('UPDATE database_metadata SET value = ? WHERE key = ?')
      .run('older-version', 'schema_version')
    sql.close()

    expect(() => ProductDatabase.open(filename)).toThrow(
      'unsupported product database version older-version',
    )
  })

  test('stores separate non-atomized model and endpoint changesets with selective context', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-area-2-'))
    directories.push(directory)
    const filename = path.join(directory, 'products.sqlite')

    const first = ProductDatabase.open(filename)
    expect(first.applyCrawl(crawl('1000', [endpoint('0.000001')]))).toEqual({
      endpointChanges: 1,
      modelChanges: 1,
      status: 'applied',
    })
    first.close()

    const database = ProductDatabase.open(filename)
    expect(database.latestCrawlId).toBe('1000')
    expect(database.applyCrawl(crawl('2000', [endpoint('0.000003')]))).toMatchObject({
      endpointChanges: 1,
      modelChanges: 0,
      status: 'applied',
    })
    expect(
      database.applyCrawl(
        crawl('3000', [endpoint('0.000003', ['tools', 'reasoning'])], [model('New name')]),
      ),
    ).toMatchObject({
      endpointChanges: 1,
      modelChanges: 1,
      status: 'applied',
    })
    expect(
      database.applyCrawl(
        crawl('4000', [endpoint('0.000003', ['reasoning', 'tools'])], [model('New name')]),
      ),
    ).toEqual({
      endpointChanges: 0,
      modelChanges: 0,
      status: 'applied',
    })
    expect(database.applyCrawl(crawl('5000', [], [model('New name')]))).toMatchObject({
      endpointChanges: 1,
      modelChanges: 0,
      status: 'applied',
    })
    expect(database.applyCrawl(crawl('5000', [], [model('New name')]))).toEqual({
      endpointChanges: 0,
      modelChanges: 0,
      status: 'already-applied',
    })

    database.close()

    const sql = new Database(filename, { readonly: true })
    const endpointChanges = sql
      .query<
        {
          readonly change_kind: string
          readonly changeset_json: string
          readonly context_json: string | null
          readonly context_kind: string
          readonly model_name: string
          readonly provider_display_name: string
        },
        []
      >(
        `SELECT change_kind, changeset_json, context_kind, context_json, model_name, provider_display_name
         FROM endpoint_changes
         ORDER BY CAST(crawl_id AS INTEGER)`,
      )
      .all()
    const currentEndpoints = sql
      .query<{ readonly count: number }, []>('SELECT count(*) AS count FROM endpoints')
      .get()
    const modelChanges = sql
      .query<
        {
          readonly changeset_json: string
          readonly context_kind: string
          readonly model_name: string
        },
        []
      >(
        `SELECT changeset_json, context_kind, model_name
         FROM model_changes
         ORDER BY CAST(crawl_id AS INTEGER)`,
      )
      .all()
    sql.close()

    expect(
      endpointChanges.map(({ change_kind, context_kind }) => ({ change_kind, context_kind })),
    ).toEqual([
      { change_kind: 'baseline', context_kind: 'entity' },
      { change_kind: 'updated', context_kind: 'pricing' },
      { change_kind: 'updated', context_kind: 'none' },
      { change_kind: 'unavailable', context_kind: 'entity' },
    ])
    expect(JSON.parse(endpointChanges[1]?.changeset_json ?? '')).toEqual([
      {
        changes: [
          {
            changes: [{ key: 'prompt', oldValue: '0.000001', type: 'UPDATE', value: '0.000003' }],
            key: 'pricing',
            type: 'UPDATE',
          },
        ],
        key: 'endpoint',
        type: 'UPDATE',
      },
    ])
    expect(JSON.parse(endpointChanges[1]?.context_json ?? '')).toEqual({
      pricing: { completion: '0.000002', prompt: '0.000003' },
    })
    expect(endpointChanges[2]?.context_json).toBeNull()
    expect(JSON.parse(endpointChanges[3]?.context_json ?? '')).toMatchObject({
      endpoint: { pricing: { completion: '0.000002', prompt: '0.000003' } },
      model: { name: 'New name', slug: 'author/model' },
    })
    expect(modelChanges.map((change) => change.context_kind)).toEqual(['entity', 'none'])
    expect(endpointChanges.map((change) => change.model_name)).toEqual([
      'Model',
      'Model',
      'New name',
      'New name',
    ])
    expect(endpointChanges.map((change) => change.provider_display_name)).toEqual([
      'Provider',
      'Provider',
      'Provider',
      'Provider',
    ])
    expect(modelChanges.map((change) => change.model_name)).toEqual(['Model', 'New name'])
    expect(JSON.parse(modelChanges[1]?.changeset_json ?? '')).toEqual([
      { key: 'name', oldValue: 'Model', type: 'UPDATE', value: 'New name' },
    ])
    expect(currentEndpoints?.count).toBe(0)
  })

  test('persists complete pricing revisions and reads chart-ready price states', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'orca-area-2-'))
    directories.push(directory)
    const filename = path.join(directory, 'products.sqlite')
    const initialPricing = {
      audio: '0.000003',
      completion: '0.000002',
      image: '0.004',
      image_output: '0.005',
      input_audio_cache: '0.000001',
      input_cache_read: '0.0000005',
      prompt: '0.000001',
    } satisfies CoreEndpoint['pricing']
    const changedPricing = { ...initialPricing, prompt: '0.000004' }
    const restoredPricing = { ...changedPricing, prompt: '0.000006' }

    const productDatabase = ProductDatabase.open(filename)
    productDatabase.applyCrawl(
      crawl('1000', [endpoint(initialPricing.prompt, ['tools'], initialPricing)]),
    )
    productDatabase.applyCrawl(
      crawl('2000', [endpoint(changedPricing.prompt, ['tools'], changedPricing)]),
    )
    const routeOnlyUpdate = endpoint(changedPricing.prompt, ['reasoning', 'tools'], changedPricing)
    productDatabase.applyCrawl(
      crawl('3000', [
        {
          ...routeOnlyUpdate,
          endpoint: { ...routeOnlyUpdate.endpoint, provider_slug: 'provider-route' },
        },
      ]),
    )
    productDatabase.applyCrawl(crawl('4000', []))
    productDatabase.applyCrawl(
      crawl('5000', [endpoint(restoredPricing.prompt, ['tools'], restoredPricing)]),
    )
    productDatabase.applyCrawl(
      crawl('6000', [endpoint(restoredPricing.prompt, ['reasoning', 'tools'], restoredPricing)]),
    )
    productDatabase.close()

    const sql = new Database(filename, { readonly: true })
    const revisions = sql
      .query<{ readonly pricing_json: string | null; readonly revision_kind: string }, []>(
        `SELECT revision_kind, pricing_json
         FROM endpoint_pricing_revisions
         ORDER BY CAST(crawl_id AS INTEGER)`,
      )
      .all()
    sql.close()

    expect(
      revisions.map(({ pricing_json, revision_kind }) => ({
        pricing: pricing_json === null ? null : (JSON.parse(pricing_json) as unknown),
        revision_kind,
      })),
    ).toEqual([
      { pricing: initialPricing, revision_kind: 'baseline' },
      { pricing: changedPricing, revision_kind: 'pricing' },
      { pricing: null, revision_kind: 'unavailable' },
      { pricing: restoredPricing, revision_kind: 'available' },
    ])
    expect(readPricingHistory(filename, model().slug)).toEqual({
      asOf: 6000,
      modelSlug: model().slug,
      series: [
        {
          endpointId: 'endpoint-id',
          points: [
            { at: 1000, available: true, pricing: initialPricing },
            { at: 2000, available: true, pricing: changedPricing },
            { at: 4000, available: false, pricing: {} },
            { at: 5000, available: true, pricing: restoredPricing },
            { at: 6000, available: true, pricing: restoredPricing },
          ],
          provider: {
            displayName: 'Provider',
            modelId: 'model',
            name: 'Provider',
            slug: 'provider',
          },
        },
      ],
      since: 1000,
    })
  })
})
