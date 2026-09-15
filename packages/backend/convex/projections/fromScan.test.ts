import { expect, test } from 'bun:test'

import { planViewWrites } from '../views/writes'
import { compareScanProjections, ScanProjection } from './index'

function endpoint(id: string, displayName: string) {
  return {
    id,
    variant: 'standard',
    provider_slug: 'google',
    provider_info: { slug: 'google', displayName, baseUrl: `https://${id}.example` },
    pricing: { prompt: '1', completion: '2', discount: 0 },
  }
}

function artifact(endpoints: unknown[]) {
  return {
    id: 'scan',
    scan_at: '2026-09-16',
    entries: [
      {
        model_id: 'author/model',
        variant: 'standard',
        model: {
          slug: 'author/model',
          permaslug: 'author/model',
          short_name: 'Model',
          created_at: '2026-01-01',
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
        endpoints,
      },
    ],
  }
}

test('provider selection and endpoint names are resolved before comparison, including reordering', () => {
  const regional = endpoint('regional', 'Google Vertex (US)')
  const generic = endpoint('generic', 'Google Vertex')
  const before = ScanProjection.parse(artifact([regional, generic]))
  const after = ScanProjection.parse(artifact([generic, regional]))
  expect(before.catalog.providers.google).toMatchObject({
    display_name: 'Google Vertex',
    metadata: { baseUrl: 'https://generic.example' },
  })
  expect(after.catalog.providers.google).toMatchObject({
    display_name: 'Google Vertex (US)',
    metadata: { baseUrl: 'https://regional.example' },
  })
  expect(before.catalog.endpoints.regional.provider_display_name).toBe('Google Vertex (US)')
  expect(after.catalog.endpoints).toEqual(before.catalog.endpoints)
  const comparison = compareScanProjections(before, after)
  expect(comparison.document.changes.map(({ key }) => key)).toEqual(['providers'])
  expect(planViewWrites(comparison)).toEqual([
    {
      table: 'providers',
      row: {
        provider_id: 'google',
        display_name: 'Google Vertex (US)',
        metadata: { baseUrl: 'https://regional.example' },
        scan_at: after.scan_at,
      },
    },
  ])
})

test('non-text entries contribute no records or readings and do not affect provider selection', () => {
  const source = artifact([endpoint('text', 'Google Vertex (US)')])
  const baseline = ScanProjection.parse(source)
  const image = {
    ...source.entries[0],
    model_id: 'image',
    model: { input_modalities: ['image'], output_modalities: ['text'] },
    endpoints: [{ ...endpoint('image', 'Google Vertex'), pricing: null, stats: { invalid: [] } }],
  }
  const projected = ScanProjection.parse({ ...source, entries: [...source.entries, image] })
  expect(projected).toEqual(baseline)
  expect(compareScanProjections(baseline, projected).document.changes).toEqual([])
})

test('shared records expose normalized context, dedicated pricing, broad metadata, and separate stats', () => {
  const source = endpoint('one', 'Google Vertex (US)')
  const before = ScanProjection.parse(
    artifact([
      {
        ...source,
        pricing: {
          ...source.pricing,
          future: [1, null],
          overrides: [{ condition: { min_tokens: 100 } }],
        },
        display_pricing: { prompt: 'display' },
        pricing_json: { future: [1, false] },
        pricing_version_id: 'version',
        status: 0,
        future: { array: [1, null, { nested: true }], empty: {} },
        stats: { endpoint_id: 'one', latency: 10 },
        statsByTier: { priority: { latency: 20 } },
      },
    ]),
  )
  const row = before.catalog.endpoints.one
  expect(row).toMatchObject({
    model_display_name: 'Model',
    input_modalities: ['text'],
    pricing: { future: [1, null] },
  })
  expect(row.metadata).toMatchObject({
    'display_pricing.prompt': 'display',
    'pricing_json.future': [1, false],
    pricing_version_id: 'version',
    status: 0,
    'future.array': [1, null, { nested: true }],
    'future.empty': {},
  })
  expect(row.metadata.pricing).toBeUndefined()
  expect(row.metadata.stats).toBeUndefined()
  expect(row.metadata.statsByTier).toBeUndefined()
  expect(before.stats.one).toEqual({ endpoint_id: 'one', tier: 'default', sample: { latency: 10 } })
  const after = structuredClone(before)
  after.stats.one.sample.latency = 30
  expect(compareScanProjections(before, after).document.changes).toEqual([])
})
