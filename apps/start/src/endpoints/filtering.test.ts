import { describe, expect, it } from 'vitest'

import { applyFilters, facetCounts, histogram, rangeHistograms, scopeSummary } from './filtering'
import { AT, endpoint, models, providers, payload } from './fixtures.testing'
import { clearedFilters } from './scope'
import type { ScopeFilters } from './scope'
import { buildRows } from './snapshot'
import type { EndpointRow } from './snapshot'

const rows = buildRows(payload)

const filters = (overrides: Partial<ScopeFilters> = {}): ScopeFilters => ({
  ...clearedFilters,
  ...overrides,
})

const ids = (overrides: Partial<ScopeFilters> = {}) =>
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
    expect(ids({ maxInput: 0.6 })).toEqual(['gpt-free', 'kimi-deepinfra', 'kimi-azure'])
    expect(ids({ minTps: 80 })).toEqual(['gpt-openai', 'kimi-deepinfra'])
    expect(ids({ minContext: 256_000 })).toEqual(['gpt-openai', 'gpt-azure', 'kimi-deepinfra'])
  })

  it('lets a free endpoint pass a maximum input price, however small', () => {
    expect(ids({ maxInput: 0.001 })).toEqual(['gpt-free'])
  })

  it('fails an endpoint with no input rate on any maximum input price', () => {
    const unpriced = buildRows({
      ...payload,
      endpoints: [
        endpoint({ id: 'unpriced', input: null, model: models.gpt, provider: providers.azure }),
      ],
    })

    expect(applyFilters(unpriced, filters({ maxInput: 1000 }), AT).map((row) => row.id)).toEqual([])
  })

  it('keeps models released within the window before the reference time', () => {
    expect(ids({ released: 3 })).toEqual(['gpt-openai', 'gpt-azure', 'gpt-free'])
    expect(ids({ released: 1 })).toEqual(['gpt-openai', 'gpt-azure'])
  })
})

/** One OpenAI endpoint for a GPT-5 released at the given time. */
const releasedAt = (id: string, createdAt: string) =>
  buildRows(
    {
      as_at: AT,
      endpoints: [
        endpoint({
          id,
          model: { ...models.gpt, created_at: createdAt },
          provider: providers.openai,
        }),
      ],
      models: [{ ...models.gpt, created_at: createdAt }],
      providers: [providers.openai],
    },
    AT,
  )

describe('release windows at month ends', () => {
  const idsAt = (at: string, months: 1 | 3 | 6 | 12, candidates: EndpointRow[]) =>
    applyFilters(candidates, filters({ released: months }), at).map((row) => row.id)

  // Margins of six hours keep the cutoffs clear of the time zone the tests run in.
  it('clamps a one-month window from 31 March to the end of February', () => {
    const candidates = [
      ...releasedAt('feb-27', '2026-02-27T12:00:00.000Z'),
      ...releasedAt('feb-28-early', '2026-02-28T06:00:00.000Z'),
      ...releasedAt('feb-28-late', '2026-02-28T18:00:00.000Z'),
      ...releasedAt('mar-01', '2026-03-01T12:00:00.000Z'),
    ]

    expect(idsAt('2026-03-31T12:00:00.000Z', 1, candidates)).toEqual(['feb-28-late', 'mar-01'])
  })

  it('clamps to 29 February in a leap year', () => {
    const candidates = [
      ...releasedAt('feb-28', '2028-02-28T12:00:00.000Z'),
      ...releasedAt('feb-29', '2028-02-29T18:00:00.000Z'),
    ]

    expect(idsAt('2028-03-31T12:00:00.000Z', 1, candidates)).toEqual(['feb-29'])
  })

  it('counts back longer windows from the last day of a long month', () => {
    const candidates = [
      ...releasedAt('apr-29', '2026-04-29T12:00:00.000Z'),
      ...releasedAt('apr-30-late', '2026-04-30T18:00:00.000Z'),
    ]

    expect(idsAt('2026-10-31T12:00:00.000Z', 6, candidates)).toEqual(['apr-30-late'])
  })

  it('keeps the release histogram bins in increasing order at a month end', () => {
    for (const at of ['2026-03-31T12:00:00.000Z', '2026-05-31T12:00:00.000Z']) {
      const { thresholds } = rangeHistograms(rows, filters(), at).released

      expect(thresholds).toHaveLength(12)
      expect(
        thresholds.every((value, index) => index === 0 || value > (thresholds[index - 1] ?? 0)),
      ).toBe(true)
    }
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

describe('the evaluation cache', () => {
  const cacheRows = buildRows(payload)

  it('returns fresh results after the filters change', () => {
    const all = facetCounts(cacheRows, filters(), AT)
    const narrowed = facetCounts(cacheRows, filters({ provider: ['azure'] }), AT)
    const again = facetCounts(cacheRows, filters(), AT)

    expect(applyFilters(cacheRows, filters({ provider: ['azure'] }), AT)).toHaveLength(2)
    expect(applyFilters(cacheRows, filters(), AT)).toHaveLength(5)
    expect(narrowed.model.get('openai/gpt-5')).toBe(1)
    expect(all.model.get('openai/gpt-5')).toBe(2)
    expect(again).toEqual(all)
  })

  it('returns fresh results after the reference time changes', () => {
    const early = applyFilters(cacheRows, filters({ released: 1 }), AT)
    const late = applyFilters(cacheRows, filters({ released: 1 }), '2027-01-01T00:00:00.000Z')

    expect(early).toHaveLength(2)
    expect(late).toHaveLength(0)
  })

  it('returns fresh results for a different row array', () => {
    const fewer = cacheRows.slice(0, 2)

    expect(applyFilters(cacheRows, filters(), AT)).toHaveLength(5)
    expect(applyFilters(fewer, filters(), AT)).toHaveLength(2)
    expect(scopeSummary(fewer, filters(), AT).endpoints).toEqual({ inScope: 2, total: 2 })
    expect(scopeSummary(cacheRows, filters(), AT).endpoints).toEqual({ inScope: 5, total: 5 })
    expect(applyFilters([], filters(), AT)).toEqual([])
  })

  it('serves every view of one evaluation from the same rows and filters', () => {
    const narrow = filters({ model: ['openai/gpt-5'] })

    expect(applyFilters(cacheRows, narrow, AT)).toBe(applyFilters(cacheRows, narrow, AT))
    expect(scopeSummary(cacheRows, narrow, AT).endpoints.inScope).toBe(2)
  })
})

describe('an empty snapshot', () => {
  const empty: EndpointRow[] = []

  it('has nothing in scope', () => {
    expect(scopeSummary(empty, filters(), AT)).toEqual({
      endpoints: { inScope: 0, total: 0 },
      models: { inScope: 0, total: 0 },
      providers: { inScope: 0, total: 0 },
    })
  })

  it('has empty facet counts', () => {
    const counts = facetCounts(empty, filters({ model: ['openai/gpt-5'], with: ['tools'] }), AT)

    expect(counts.model.size).toBe(0)
    expect(counts.provider.size).toBe(0)
    expect(counts.properties.get('tools')).toEqual({ with: 0, without: 0 })
  })

  it('has empty histograms with every bin zero', () => {
    for (const { counts, missing, thresholds } of Object.values(
      rangeHistograms(empty, filters({ maxInput: 1, released: 3 }), AT),
    )) {
      expect(missing).toBe(0)
      expect(counts).toHaveLength(thresholds.length + 1)
      expect(counts.every((count) => count === 0)).toBe(true)
    }
  })
})

describe('histogram', () => {
  it('bins values between thresholds, open-ended at both ends', () => {
    expect(histogram([0, 1, 1.5, 2, 9, null], [1, 2], 'lower')).toEqual({
      counts: [1, 2, 2],
      missing: 1,
      thresholds: [1, 2],
    })
  })

  it('puts a value on a threshold in the bin below when bins include their upper threshold', () => {
    expect(histogram([0, 1, 1.5, 2, 9], [1, 2], 'upper').counts).toEqual([2, 2, 1])
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

  it('counts free endpoints in the lowest price bin', () => {
    const { counts, missing } = rangeHistograms(rows, filters(), AT).maxInput

    expect(counts[0]).toBe(1)
    expect(missing).toBe(0)
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

describe('shared results', () => {
  const sharedRows = buildRows(payload)

  it('computes once for the same rows and filters, even through a new filters object', () => {
    const first = facetCounts(sharedRows, filters({ with: ['tools'] }), AT)

    expect(facetCounts(sharedRows, filters({ with: ['tools'] }), AT)).toBe(first)

    const histograms = rangeHistograms(sharedRows, filters({ with: ['tools'] }), AT)

    expect(rangeHistograms(sharedRows, filters({ with: ['tools'] }), AT)).toBe(histograms)

    const summary = scopeSummary(sharedRows, filters({ with: ['tools'] }), AT)

    expect(scopeSummary(sharedRows, filters({ with: ['tools'] }), AT)).toBe(summary)
  })

  it('keeps a kind of counts whose contents are equal when another kind changes', () => {
    const all = facetCounts(sharedRows, filters(), AT)
    const ticked = facetCounts(sharedRows, filters({ model: ['openai/gpt-5'] }), AT)

    // A list facet's counts ignore its own selection, so ticking a model leaves them as they were.
    expect(ticked.model).toBe(all.model)
    expect(ticked.provider).not.toBe(all.provider)
    expect(ticked.provider.get('deepinfra')).toBeUndefined()
    expect(ticked.properties).not.toBe(all.properties)
  })

  it('keeps counts across a change that only reaches other rows sets', () => {
    const base = facetCounts(sharedRows, filters(), AT)

    facetCounts(sharedRows, filters({ unlisted: true }), AT)

    const back = facetCounts(sharedRows, filters(), AT)

    expect(back).toEqual(base)
    expect(back.model).toEqual(base.model)
  })

  it('keeps a histogram whose contents are equal when another bound changes', () => {
    const open = rangeHistograms(sharedRows, filters(), AT)
    const bounded = rangeHistograms(sharedRows, filters({ maxInput: 0.6 }), AT)

    // A bound's own histogram ignores that bound.
    expect(bounded.maxInput).toBe(open.maxInput)
    expect(bounded.minTps).not.toBe(open.minTps)
    expect(bounded.minContext).not.toBe(open.minContext)
  })

  it('keeps a summary whose counts are equal, in whole or in part', () => {
    const open = scopeSummary(sharedRows, filters(), AT)

    // A bound that keeps every row changes nothing.
    expect(scopeSummary(sharedRows, filters({ maxInput: 1000 }), AT)).toBe(open)

    const narrowed = scopeSummary(sharedRows, filters({ maxInput: 0.6 }), AT)

    expect(narrowed.endpoints).not.toEqual(open.endpoints)
    expect(narrowed.models).not.toEqual(open.models)
    expect(narrowed.providers).toBe(open.providers)
  })

  it('shares nothing across row sets', () => {
    const other = buildRows(payload)

    expect(facetCounts(other, filters(), AT)).not.toBe(facetCounts(sharedRows, filters(), AT))
  })
})
