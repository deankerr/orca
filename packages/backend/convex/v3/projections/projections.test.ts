/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import { validate } from 'convex-helpers/validators'

import { createScanArtifact } from '../../scan/artifact'
import { endpointsStatsTable } from '../series.table'
import { createScanProjection } from './create'
import { diffScanProjections } from './diff'

function artifact(scan_at: string, endpoints: unknown[]) {
  return createScanArtifact(
    [
      {
        model_id: 'author/model',
        variant: 'standard',
        model: {
          slug: 'author/model',
          permaslug: 'author/model',
          input_modalities: ['text'],
          output_modalities: ['text'],
          created_at: '2026-01-01',
          short_name: 'Model',
          author_display_name: 'Author',
        },
        endpoints,
      },
    ],
    scan_at,
  )
}

function endpoint(id: string, prompt: string) {
  return {
    id,
    model_variant_slug: 'author/model',
    variant: 'standard',
    provider_slug: 'provider',
    provider_info: { slug: 'provider', displayName: 'Provider' },
    pricing: { prompt, completion: '2', discount: 0 },
  }
}

describe('scan projection', () => {
  test('preserves numeric, string, and null stats through projection and storage validation', () => {
    const sample = {
      latency_metric: 'latency',
      p50_latency: 13,
      p50_throughput: null,
      throughput_request_count: 0,
    }

    const projection = createScanProjection(
      artifact('2026-09-09', [
        { ...endpoint('one', '1'), stats: { endpoint_id: 'one', ...sample } },
      ]),
    )

    const row = projection.stats.get('one')

    expect(row).toEqual({
      endpoint_id: 'one',
      scan_at: '2026-09-09',
      tier: 'default',
      sample,
    })
    expect(validate(endpointsStatsTable.validator, row)).toBe(true)
  })

  test('uses the artifact timestamp', () => {
    const source = artifact('entry-time', [endpoint('one', '1')])
    const projection = createScanProjection({ ...source, scan_at: 'artifact-time' })

    const rows = [
      ...projection.models.values(),
      ...projection.providers.values(),
      ...projection.endpoints.values(),
      ...projection.pricing.values(),
    ]

    expect(rows.map((row) => row.scan_at)).toEqual(Array.from({ length: 4 }, () => 'artifact-time'))
    expect(projection.models.get('author/model')?.metadata.author_display_name).toBe('Author')
  })

  test('plans changed pricing, removed endpoints, and every next stats sample', () => {
    const previous = createScanProjection(
      artifact('2026-01-01', [endpoint('one', '1'), endpoint('two', '1')]),
    )

    const nextEndpoint = {
      ...endpoint('one', '2'),
      stats: { endpoint_id: 'one', ignored: 1 },
      statsByTier: {
        priority: { endpoint_id: 'one', p50_latency: 10 },
      },
    }

    const next = createScanProjection(artifact('2026-01-02', [nextEndpoint]))
    const writes = diffScanProjections(previous, next)

    expect([...next.endpoints]).toHaveLength(1)

    expect(writes.map((write) => write.table)).toEqual([
      'endpoints',
      'endpoints',
      'endpointListings',
      'endpointsPricing',
      'stats',
    ])

    expect(writes[0]).toMatchObject({
      table: 'endpoints',
      row: { endpoint_id: 'one', pricing: { meters: { prompt: '2' } } },
    })

    expect(writes[1]).toMatchObject({
      row: { endpoint_id: 'two', scan_at: '2026-01-02', unlisted_at: '2026-01-02' },
    })

    expect(writes[2]).toEqual({
      table: 'endpointListings',
      row: { endpoint_id: 'two', scan_at: '2026-01-02', state: 'unlisted' },
    })

    expect(writes[3]).toMatchObject({
      row: { discount: 0, meters: { completion: '2', prompt: '2' } },
    })

    expect(writes[4]).toEqual({
      table: 'stats',
      row: {
        endpoint_id: 'one',
        scan_at: '2026-01-02',
        tier: 'default',
        sample: { ignored: 1 },
      },
    })
  })

  test('retains and detects arbitrary pricing meters', () => {
    const previousEndpoint = {
      ...endpoint('one', '1'),
      pricing: { ...endpoint('one', '1').pricing, future_meter: '1' },
    }

    const nextEndpoint = {
      ...endpoint('one', '1'),
      pricing: { ...endpoint('one', '1').pricing, future_meter: '2' },
    }

    const writes = diffScanProjections(
      createScanProjection(artifact('2026-01-01', [previousEndpoint])),
      createScanProjection(artifact('2026-01-02', [nextEndpoint])),
    )

    expect(writes[0]).toMatchObject({
      table: 'endpoints',
      row: { pricing: { meters: { future_meter: '2' } } },
    })

    expect(writes.slice(1)).toEqual([
      {
        table: 'endpointsPricing',
        row: {
          endpoint_id: 'one',
          scan_at: '2026-01-02',
          discount: 0,
          meters: { completion: '2', future_meter: '2', prompt: '1' },
          overrides: undefined,
        },
      },
    ])
  })

  test('ignores non-string pricing properties while preserving overrides', () => {
    const source = endpoint('one', '1')
    const overrides = [{ prompt: '3', condition: { min_tokens: 32_000 } }]

    const projection = createScanProjection(
      artifact('2026-01-01', [
        {
          ...source,
          pricing: {
            ...source.pricing,
            future_meter: '4',
            line_items: [{ type: 'long_context_threshold', value: '32000' }],
            future_array: [],
            future_object: { prompt: '5' },
            future_number: 6,
            future_boolean: false,
            future_null: null,
            overrides,
          },
        },
      ]),
    )

    expect(projection.pricing.get('one')).toEqual({
      endpoint_id: 'one',
      scan_at: '2026-01-01',
      discount: 0,
      meters: { prompt: '1', completion: '2', future_meter: '4' },
      overrides: [{ prompt: '3', 'condition.min_tokens': 32_000 }],
    })
  })

  test('records listing and relisting transitions only', () => {
    const absent = createScanProjection(artifact('2026-01-01', []))
    const listed = createScanProjection(artifact('2026-01-02', [endpoint('one', '1')]))
    const stillListed = createScanProjection(artifact('2026-01-03', [endpoint('one', '1')]))
    const unlisted = createScanProjection(artifact('2026-01-04', []))
    const relisted = createScanProjection(artifact('2026-01-05', [endpoint('one', '1')]))

    expect(diffScanProjections(absent, listed)).toContainEqual({
      table: 'endpointListings',
      row: { endpoint_id: 'one', scan_at: '2026-01-02', state: 'listed' },
    })

    expect(
      diffScanProjections(listed, stillListed).filter(({ table }) => table === 'endpointListings'),
    ).toEqual([])

    expect(diffScanProjections(stillListed, unlisted)).toContainEqual({
      table: 'endpointListings',
      row: { endpoint_id: 'one', scan_at: '2026-01-04', state: 'unlisted' },
    })

    expect(diffScanProjections(unlisted, relisted)).toContainEqual({
      table: 'endpointListings',
      row: { endpoint_id: 'one', scan_at: '2026-01-05', state: 'listed' },
    })
  })

  test('requires pricing', () => {
    const { pricing: _, ...withoutPricing } = endpoint('one', '1')
    expect(() => createScanProjection(artifact('2026-01-01', [withoutPricing]))).toThrow()
  })
})

test('retains provider dataPolicy metadata', () => {
  const projection = createScanProjection(
    artifact('2026-09-10T00:00:00Z', [
      {
        ...endpoint('one', '1'),
        provider_info: {
          slug: 'provider',
          displayName: 'Provider',
          dataPolicy: {
            termsOfServiceURL: 'https://example.com/terms',
            privacyPolicyURL: null,
            retainsPrompts: true,
          },
        },
      },
    ]),
  )
  const metadata = projection.providers.get('provider')?.metadata
  expect(metadata?.['dataPolicy.termsOfServiceURL']).toBe('https://example.com/terms')
  expect(metadata?.['dataPolicy.privacyPolicyURL']).toBeNull()
  expect(metadata?.['dataPolicy.retainsPrompts']).toBe(true)
})
