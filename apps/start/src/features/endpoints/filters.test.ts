import { describe, expect, it } from 'vitest'

import { applyFilters, facetCounts, histogram, rangeHistograms, scopeSummary } from './filters'
import { AT, snapshot } from './fixtures.testing'
import { buildRows } from './rows'
import { clearedFilters } from './search'
import type { EndpointFilters } from './search'

const rows = buildRows(snapshot)

const filters = (overrides: Partial<EndpointFilters> = {}): EndpointFilters => ({
  ...clearedFilters,
  ...overrides,
})

const ids = (overrides: Partial<EndpointFilters> = {}) =>
  applyFilters(rows, filters(overrides), AT).map((row) => row.id)

describe('applyFilters', () => {
  it('hides unlisted endpoints unless asked to show them', () => {
    expect(ids()).toEqual(['gpt-openai', 'gpt-azure', 'gpt-free', 'kimi-deepinfra', 'kimi-azure'])
    expect(ids({ unlisted: true })).toContain('kimi-old')
  })

  it('combines values within a list facet with OR and facets with AND', () => {
    expect(ids({ provider: ['azure', 'deepinfra'] })).toEqual([
      'gpt-azure',
      'kimi-deepinfra',
      'kimi-azure',
    ])
    expect(ids({ model: ['moonshotai/kimi-k3'], provider: ['azure', 'openai'] })).toEqual([
      'kimi-azure',
    ])
  })

  it('requires included properties active and excluded ones inactive', () => {
    expect(ids({ with: ['tools', 'zdr'] })).toEqual(['gpt-openai', 'kimi-deepinfra'])
    expect(ids({ with: ['tools'], without: ['zdr'] })).toEqual(['gpt-azure'])
  })

  it('applies inclusive range bounds, failing absent values', () => {
    expect(ids({ maxInput: 0.6 })).toEqual(['kimi-deepinfra', 'kimi-azure'])
    expect(ids({ minTps: 80 })).toEqual(['gpt-openai', 'kimi-deepinfra'])
    expect(ids({ minContext: 256_000 })).toEqual(['gpt-openai', 'gpt-azure', 'kimi-deepinfra'])
  })

  it('keeps models released within the window before the reference time', () => {
    expect(ids({ released: 3 })).toEqual(['gpt-openai', 'gpt-azure', 'gpt-free'])
    expect(ids({ released: 1 })).toEqual(['gpt-openai', 'gpt-azure'])
  })
})

describe('facetCounts', () => {
  const counts = facetCounts(rows, filters({ model: ['openai/gpt-5'], with: ['tools'] }), AT)

  it('counts list values against every other facet', () => {
    expect(Object.fromEntries(counts.model)).toEqual({
      'moonshotai/kimi-k3': 1,
      'openai/gpt-5': 2,
    })
    expect(Object.fromEntries(counts.provider)).toEqual({ azure: 1, openai: 1 })
  })

  it('counts a set property against every other facet', () => {
    expect(counts.properties.get('tools')).toEqual({ with: 2, without: 0 })
  })

  it('counts an unset property within the current scope', () => {
    expect(counts.properties.get('zdr')).toEqual({ with: 1, without: 1 })
  })

  it('counts an excluded property both ways', () => {
    const excluded = facetCounts(rows, filters({ without: ['zdr'] }), AT)

    expect(excluded.properties.get('zdr')).toEqual({ with: 2, without: 3 })
  })
})

describe('histogram', () => {
  it('bins values between thresholds, open-ended at both ends', () => {
    expect(histogram([0, 1, 1.5, 2, 9, null], [1, 2])).toEqual({
      counts: [1, 2, 2],
      missing: 1,
      thresholds: [1, 2],
    })
  })
})

describe('rangeHistograms', () => {
  it('bins each range over the rows matching every other facet', () => {
    const histograms = rangeHistograms(rows, filters({ maxInput: 1, minTps: 50 }), AT)

    // minTps keeps gpt-openai, gpt-azure, and kimi-deepinfra: 0.5 and twice 1.25.
    expect(histograms.maxInput.counts.filter((count) => count > 0)).toEqual([1, 2])
    // maxInput keeps both Kimi endpoints: 120 and 40 tok/s.
    expect(histograms.minTps.counts.reduce((sum, count) => sum + count, 0)).toBe(2)
    // Both bounds hold only kimi-deepinfra.
    expect(histograms.minContext.counts.reduce((sum, count) => sum + count, 0)).toBe(1)
  })

  it('counts rows without a value as missing', () => {
    expect(rangeHistograms(rows, filters(), AT).minTps.missing).toBe(1)
  })
})

describe('scopeSummary', () => {
  it('counts endpoints, models, and providers in scope against the universe', () => {
    expect(scopeSummary(rows, filters({ model: ['moonshotai/kimi-k3'] }), AT)).toEqual({
      endpoints: { inScope: 2, total: 5 },
      models: { inScope: 1, total: 3 },
      providers: { inScope: 2, total: 3 },
    })
  })

  it('widens the universe when unlisted endpoints are shown', () => {
    expect(scopeSummary(rows, filters({ unlisted: true }), AT).endpoints).toEqual({
      inScope: 6,
      total: 6,
    })
  })
})
