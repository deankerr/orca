import { defaultWorkload } from '@orca/pricing'
import { describe, expect, it } from 'vitest'

import { endpoint, models, providers, payload } from './fixtures.testing'
import { buildRows } from './snapshot'
import { isSortColumn, parseSortKey, sortRows, sortWorkload, toSortKey } from './sort'

const rows = buildRows(payload).filter((row) => !row.unlisted)
const uncached = { hitRate: 0, ratio: 3 }

const order = (key: Parameters<typeof sortRows>[1], workload = defaultWorkload) =>
  sortRows(rows, key, workload).map((row) => row.id)

describe('sortRows', () => {
  it('sorts numbers ascending with absent values last', () => {
    expect(order('throughput')).toEqual([
      'kimi-azure',
      'gpt-azure',
      'gpt-openai',
      'kimi-deepinfra',
      'gpt-free',
    ])
  })

  it('sorts free endpoints first by price ascending and last descending, before absent prices', () => {
    const unpriced = buildRows({
      ...payload,
      endpoints: [
        endpoint({ id: 'unpriced', input: null, model: models.gpt, provider: providers.azure }),
      ],
    })

    const priced = [...rows, ...unpriced]

    const sorted = (key: Parameters<typeof sortRows>[1]) =>
      sortRows(priced, key, defaultWorkload).map((row) => row.id)

    expect(sorted('input')).toEqual([
      'gpt-free',
      'kimi-deepinfra',
      'kimi-azure',
      'gpt-azure',
      'gpt-openai',
      'unpriced',
    ])
    expect(sorted('-input')).toEqual([
      'gpt-azure',
      'gpt-openai',
      'kimi-azure',
      'kimi-deepinfra',
      'gpt-free',
      'unpriced',
    ])
    expect(sorted('cost')[0]).toBe('gpt-free')
    expect(sorted('-cost').slice(-2)).toEqual(['gpt-free', 'unpriced'])
  })

  it('sorts by workload cost under the workload given', () => {
    // At 100 input tokens per output token and a 90% hit rate, the cached GPT-5 on Azure beats the
    // cheaper-input Kimi endpoints; with no cache hits it costs the same as GPT-5 on OpenAI, which
    // has no cache, and both fall behind.
    expect(order('cost', defaultWorkload)).toEqual([
      'gpt-free',
      'gpt-azure',
      'kimi-deepinfra',
      'kimi-azure',
      'gpt-openai',
    ])
    expect(order('cost', uncached)).toEqual([
      'gpt-free',
      'kimi-deepinfra',
      'kimi-azure',
      'gpt-azure',
      'gpt-openai',
    ])
    expect(order('-cost', uncached).slice(0, 2)).toEqual(['gpt-azure', 'gpt-openai'])
  })

  it('puts endpoints without a cost last in either direction', () => {
    const unpriced = buildRows({
      ...payload,
      endpoints: [
        endpoint({ id: 'unpriced', input: null, model: models.gpt, provider: providers.azure }),
      ],
    })

    for (const key of ['cost', '-cost'] as const) {
      expect(sortRows([...unpriced, ...rows], key, uncached).at(-1)?.id).toBe('unpriced')
    }
  })

  it('keeps absent values last when descending', () => {
    expect(order('-throughput')).toEqual([
      'kimi-deepinfra',
      'gpt-openai',
      'gpt-azure',
      'kimi-azure',
      'gpt-free',
    ])
  })

  it('sorts text by display name, breaking ties by provider', () => {
    expect(order('-model')).toEqual([
      'kimi-azure',
      'kimi-deepinfra',
      'gpt-free',
      'gpt-azure',
      'gpt-openai',
    ])
  })

  it('does not mutate its input', () => {
    const before = rows.map((row) => row.id)

    sortRows(rows, '-cost', defaultWorkload)

    expect(rows.map((row) => row.id)).toEqual(before)
  })
})

describe('sort keys', () => {
  it('prefix descending columns with a minus', () => {
    expect(parseSortKey('-cost')).toEqual({ column: 'cost', descending: true })
    expect(parseSortKey('input')).toEqual({ column: 'input', descending: false })
    expect(toSortKey('throughput', true)).toBe('-throughput')
  })

  it('accepts only sortable columns', () => {
    expect(isSortColumn('latency')).toBe(true)
    expect(isSortColumn('properties')).toBe(false)
  })
})

// The Table sorts under the deferred workload and shows costs under it too, so the two always agree
// while both trail the URL's workload. `useDeferredScopedRows` sorts under `sortWorkload(sort, deferred)`.
describe('sortWorkload', () => {
  const cached = { hitRate: 0.9, ratio: 100 }

  it('is the workload given when sorting by cost, in either direction', () => {
    expect(sortWorkload('cost', cached)).toBe(cached)
    expect(sortWorkload('-cost', cached)).toBe(cached)
  })

  it('is one constant under any other sort, so a workload change does not re-sort', () => {
    expect(sortWorkload('input', cached)).toBe(defaultWorkload)
    expect(sortWorkload('-throughput', uncached)).toBe(defaultWorkload)
  })

  it('orders rows by the workload given, not the newer one', () => {
    // Sorting under the deferred (older) workload gives the order its costs show; the URL's newer
    // workload would give another, which is what the Table must not show beside the old costs.
    const ids = (workload: typeof uncached) =>
      sortRows(rows, 'cost', sortWorkload('cost', workload)).map((row) => row.id)

    expect(ids(uncached)).toEqual(order('cost', uncached))
    expect(ids(uncached)).not.toEqual(ids(cached))
  })
})
