import { describe, expect, it } from 'vitest'

import { endpoint, models, providers, snapshot } from './fixtures.testing'
import { buildRows } from './rows'
import { sortRows } from './sort'

const rows = buildRows(snapshot).filter((row) => !row.unlisted)
const order = (key: Parameters<typeof sortRows>[1]) => sortRows(rows, key).map((row) => row.id)

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
      ...snapshot,
      endpoints: [
        endpoint({ id: 'unpriced', input: null, model: models.gpt, provider: providers.azure }),
      ],
    })

    const priced = [...rows, ...unpriced]

    const sorted = (key: Parameters<typeof sortRows>[1]) =>
      sortRows(priced, key).map((row) => row.id)

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
    expect(sorted('blend')[0]).toBe('gpt-free')
    expect(sorted('-blend').slice(-2)).toEqual(['gpt-free', 'unpriced'])
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

    sortRows(rows, '-blend')

    expect(rows.map((row) => row.id)).toEqual(before)
  })
})
