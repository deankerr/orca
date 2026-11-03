import { describe, expect, it } from 'vitest'

import { AT, endpoint, models, providers, snapshot } from './fixtures.testing'
import { buildCatalog, buildRows, referenceTime } from './rows'

describe('buildRows', () => {
  const rows = buildRows(snapshot)
  const row = (id: string) => rows.find((candidate) => candidate.id === id)

  it('joins every endpoint to its model and provider', () => {
    expect(rows).toHaveLength(6)
    expect(row('kimi-deepinfra')).toMatchObject({
      model: { id: 'moonshotai/kimi-k3' },
      provider: { id: 'deepinfra' },
    })
  })

  it('skips endpoints whose model or provider does not resolve', () => {
    const orphan = endpoint({ id: 'orphan', model: models.gpt, provider: providers.openai })

    expect(buildRows({ ...snapshot, endpoints: [orphan], providers: [] })).toEqual([])
  })

  it('converts rates to $/M and blends them three to one', () => {
    expect(row('gpt-azure')).toMatchObject({
      blend: (3 * 1.25 + 10) / 4,
      cacheRead: 0.125,
      input: 1.25,
      output: 10,
      rates: { cacheRead: '0.000000125', input: '0.00000125', output: '0.00001' },
    })
  })

  it('keeps zero rates as a price of $0, blending to 0', () => {
    expect(row('gpt-free')).toMatchObject({
      blend: 0,
      input: 0,
      output: 0,
      rates: { input: '0', output: '0' },
    })
  })

  it('treats missing, negative, and malformed rates as absent', () => {
    for (const input of [null, '-0.000001', 'free']) {
      const [absent] = buildRows({
        ...snapshot,
        endpoints: [
          endpoint({
            id: 'absent',
            input,
            model: models.gpt,
            output: '0.00001',
            provider: providers.openai,
          }),
        ],
      })

      expect(absent).toMatchObject({ blend: null, input: null, output: 10, rates: { input: null } })
    }
  })

  it('leaves unrepresentable rates unquoted for sorting but keeps their strings for display', () => {
    const [extreme] = buildRows({
      ...snapshot,
      endpoints: [
        endpoint({
          id: 'extreme',
          input: '1e309',
          model: models.gpt,
          output: '0.00001',
          provider: providers.openai,
        }),
      ],
    })

    expect(extreme).toMatchObject({ blend: null, input: null, output: 10 })
    expect(extreme?.rates.input).toBe('1e309')
  })

  it('carries stats, context, release time, and listing', () => {
    expect(row('kimi-deepinfra')).toMatchObject({
      context: 256_000,
      latency: 500,
      released: Date.parse('2025-06-01T00:00:00.000Z'),
      throughput: 120,
      unlisted: false,
    })
    expect(row('kimi-old')).toMatchObject({ latency: null, throughput: null, unlisted: true })
  })

  it('resolves active properties', () => {
    expect([...(row('gpt-openai')?.properties.keys() ?? [])]).toEqual(
      expect.arrayContaining(['tools', 'zdr', 'new_model']),
    )
    expect(row('gpt-free')?.properties.has('free')).toBe(true)
    expect(row('kimi-old')?.properties.has('unlisted')).toBe(true)
  })
})

describe('reference time', () => {
  it('is the scan time, else now', () => {
    const now = new Date('2026-11-03T00:00:00.000Z')

    expect(referenceTime({ as_at: AT }, now)).toBe(AT)
    expect(referenceTime({ as_at: null }, now)).toBe('2026-11-03T00:00:00.000Z')
  })
})

describe('buildCatalog', () => {
  it('builds once per snapshot and indexes rows by endpoint ID', () => {
    const catalog = buildCatalog(snapshot)

    expect(buildCatalog(snapshot)).toBe(catalog)
    expect(catalog.at).toBe(AT)
    expect(catalog.byId.get('gpt-openai')?.provider.id).toBe('openai')
  })

  it('builds an empty catalogue from an empty snapshot', () => {
    const catalog = buildCatalog({ as_at: AT, endpoints: [], models: [], providers: [] })

    expect(catalog.rows).toEqual([])
    expect(catalog.byId.size).toBe(0)
    expect(catalog.at).toBe(AT)
  })

  it('falls back to the build time before the first scan', () => {
    const before = Date.now()
    const catalog = buildCatalog({ as_at: null, endpoints: [], models: [], providers: [] })

    expect(Date.parse(catalog.at)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(catalog.at)).toBeLessThanOrEqual(Date.now())
  })
})
