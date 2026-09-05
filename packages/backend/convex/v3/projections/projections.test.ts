/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import { createScanArtifact } from '../../scan/artifact'
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
      'endpointListings',
      'endpointsPricing',
      'stats',
    ])
    expect(writes[0]).toMatchObject({
      row: { endpoint_id: 'two', scan_at: '2026-01-02', unlisted_at: '2026-01-02' },
    })
    expect(writes[1]).toEqual({
      table: 'endpointListings',
      row: { endpoint_id: 'two', scan_at: '2026-01-02', state: 'unlisted' },
    })
    expect(writes[2]).toMatchObject({
      row: { discount: 0, meters: { completion: '2', prompt: '2' } },
    })
    expect(writes[3]).toEqual({
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

    expect(writes).toEqual([
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
