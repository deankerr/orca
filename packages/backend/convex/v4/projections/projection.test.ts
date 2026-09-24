import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'

import { convexToJson } from 'convex/values'
import { isPlainObject } from 'remeda'

import { ScanArtifactEntry } from '../../scan/schema'
import { SourceProvider, StoredModel } from '../scan/entities'
import { extractScan } from '../scan/extract'
import { prepareBaseline, prepareForward } from './compare'
import { decodeMetadata } from './metadata'
import { projectEndpoint, projectModel, projectProvider, projectScan } from './product'

const A = '2026-09-15T00:00:00.000Z'
const B = '2026-09-16T00:00:00.000Z'

test('object key order changes neither retained output nor JSON-backed cache fields', () => {
  const before = extractScan(A, [entry(A)])
  const reordered: unknown = JSON.parse(
    JSON.stringify(entry(B), (_key, value: unknown) =>
      isPlainObject(value) ? Object.fromEntries(Object.entries(value).toReversed()) : value,
    ),
  )
  const after = extractScan(B, [ScanArtifactEntry.parse(reordered)])
  const changes = prepareForward(before, after)
  expect(changes.records).toEqual([])
  expect(changes.prices).toEqual([])
  expect(changes.listings).toEqual([])
  expect(changes.models).toEqual([])
  expect(changes.providers).toEqual([])
  expect(changes.endpoints).toEqual([])
  expect(projectScan(before).endpoints.get('endpoint')?.metadata_json).toBe(
    projectScan(after).endpoints.get('endpoint')?.metadata_json,
  )
})

function entry(scanAt: string) {
  return ScanArtifactEntry.parse({
    scan_at: scanAt,
    model_id: 'author/model:free',
    variant: 'free',
    model: {
      slug: 'author/model',
      permaslug: 'author/model-v1',
      short_name: 'Model',
      created_at: '2026-01-01',
      input_modalities: ['text'],
      output_modalities: ['text'],
      future: { $source: 1, café: [{ 'bad\nkey': null }] },
    },
    endpoints: [
      {
        id: 'endpoint',
        variant: 'free',
        model_variant_slug: 'author/model:free',
        provider_slug: 'provider/request-target',
        provider_info: { slug: 'provider', displayName: 'Provider', future: { $policy: false } },
        model: { slug: 'incorrect-standard-model' },
        pricing: {
          prompt: '0.000001',
          completion: '0',
          discount: 0,
          display_pricing: [{ label: 'Presentation only' }],
          overrides: [
            { prompt: '0.000002', condition: { min_tokens: 32_000, $future: [1, null] } },
          ],
        },
        data_policy: { training: false },
        features: { supports_native_web_search: false },
        // Owner names and literal dotted keys must coexist with related-entity metadata.
        provider: { own: true },
        'model.future': 'literal',
        future: [{ $key: true, café: null }],
        stats: { endpoint_id: 'endpoint', latency: 10 },
        statsByTier: {
          default: { endpoint_id: 'endpoint', latency: 10 },
          priority: { latency: 5 },
        },
      },
    ],
  })
}

test('extraction survives record round trips and projects arbitrary facts through Convex-safe JSON', () => {
  const source = entry(A)
  const scan = extractScan(A, [source])
  const extracted = scan.endpoints.get('endpoint')
  assert.ok(extracted)
  expect(extracted.raw).not.toHaveProperty('provider_slug')
  expect(extracted.raw).not.toHaveProperty('provider_info')
  expect(extracted.raw).not.toHaveProperty('model')
  expect(extracted.raw).not.toHaveProperty('stats')
  expect(extracted.raw).not.toHaveProperty('statsByTier')
  expect(extracted.raw.provider_tag).toBe('provider/request-target')
  expect(source.endpoints?.[0]).toHaveProperty('provider_slug', 'provider/request-target')

  const baseline = prepareBaseline(scan)
  expect(baseline.readings).toHaveLength(2)
  expect(baseline.listings[0]).toMatchObject({
    model_id: 'author/model:free',
    provider_id: 'provider',
  })
  const modelRecord = baseline.records.find((row) => row.entity_kind === 'model')
  const providerRecord = baseline.records.find((row) => row.entity_kind === 'provider')
  const endpointRecord = baseline.records.find((row) => row.entity_kind === 'endpoint')
  assert.ok(modelRecord && providerRecord && endpointRecord)
  expect(endpointRecord).not.toHaveProperty('provider_tag')

  const model = projectModel(JSON.parse(modelRecord.raw_json), A)
  const provider = projectProvider(JSON.parse(providerRecord.raw_json), A)
  const endpoint = projectEndpoint({
    raw: JSON.parse(endpointRecord.raw_json),
    model,
    provider,
    model_id: 'author/model:free',
    provider_id: 'provider',
    scan_at: A,
  })
  const live = projectScan(scan).endpoints.get('endpoint')
  assert.ok(live)
  expect(endpoint).toEqual(live)
  expect(model.variant).toBe('free')
  expect(endpoint.pricing).toEqual({
    discount: baseline.prices[0]?.discount,
    meters: baseline.prices[0]?.meters,
    overrides_json: baseline.prices[0]?.overrides_json,
  })
  expect(decodeMetadata(endpoint.metadata_json)).toMatchObject({
    endpoint: {
      provider: { own: true },
      'model.future': 'literal',
      future: [{ $key: true, café: null }],
    },
    model: { future: { $source: 1, café: [{ 'bad\nkey': null }] } },
    provider: { future: { $policy: false } },
  })
  expect(() => convexToJson({ baseline, model, provider, endpoint })).not.toThrow()
})

test('nested override changes survive pricing while accessor changes remain endpoint data', () => {
  const before = extractScan(A, [entry(A)])
  const after = extractScan(B, [entry(B)])
  const endpoint = after.endpoints.get('endpoint')
  assert.ok(endpoint)
  endpoint.raw.provider_tag = 'another/request-target'
  endpoint.raw.pricing.overrides = [
    { prompt: '0.000002', condition: { min_tokens: 64_000, $future: [1, null] } },
  ]
  const changes = prepareForward(before, after)
  expect(changes.records).toHaveLength(1)
  expect(changes.listings).toEqual([])
  expect(changes.prices).toHaveLength(1)
  expect(JSON.parse(changes.prices[0]?.overrides_json ?? 'null')).toEqual(
    endpoint.raw.pricing.overrides,
  )
  expect(changes.readings).toHaveLength(2)

  endpoint.raw.pricing.overrides = before.endpoints.get('endpoint')?.raw.pricing.overrides
  expect(prepareForward(before, after).prices).toEqual([])
  expect(prepareForward(before, after).records).toHaveLength(1)
})

test('Catalog retains omitted entities, propagates related changes, and relists complete rows', () => {
  const before = extractScan(A, [entry(A)])
  const next = extractScan(B, [entry(B)])
  const model = next.models.get('author/model:free')
  const provider = next.providers.get('provider')
  assert.ok(model && provider)
  const modelValue = StoredModel.parse(model.raw)
  modelValue.model.short_name = 'Renamed model'
  model.raw = modelValue
  provider.raw = { ...SourceProvider.parse(provider.raw), displayName: 'Renamed provider' }
  const changes = prepareForward(before, next)
  expect(changes.models).toHaveLength(1)
  expect(changes.providers).toHaveLength(1)
  expect(changes.endpoints[0]).toMatchObject({
    model_display_name: 'Renamed model',
    provider_display_name: 'Renamed provider',
  })

  const C = '2026-09-17T00:00:00.000Z'
  const absent = extractScan(C, [])
  const removed = prepareForward(next, absent)
  expect(removed.models).toEqual([])
  expect(removed.providers).toEqual([])
  expect(removed.endpoints).toEqual([{ ...changes.endpoints[0], scan_at: C, unlisted_at: C }])
  const D = '2026-09-18T00:00:00.000Z'
  expect(prepareForward(absent, extractScan(D, [])).endpoints).toEqual([])
  const returned = prepareForward(absent, extractScan(D, [entry(D)]))
  expect(returned.models).toHaveLength(1)
  expect(returned.providers).toHaveLength(1)
  expect(returned.endpoints).toHaveLength(1)
  expect(returned.endpoints[0]).not.toHaveProperty('unlisted_at')
})
