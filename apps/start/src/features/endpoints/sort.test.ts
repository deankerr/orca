import { describe, expect, it } from 'vitest'

import { snapshot } from './fixtures.testing'
import { buildRows } from './rows'
import { sortRows } from './sort'

const rows = buildRows(snapshot).filter((row) => !row.unlisted)
const order = (key: Parameters<typeof sortRows>[1]) => sortRows(rows, key).map((row) => row.id)

describe('sortRows', () => {
  it('sorts numbers ascending with absent values last', () => {
    expect(order('input')).toEqual([
      'kimi-deepinfra',
      'kimi-azure',
      'gpt-azure',
      'gpt-openai',
      'gpt-free',
    ])
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
