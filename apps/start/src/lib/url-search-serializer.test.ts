import { describe, expect, it } from 'vitest'

import { stringifySearch } from './url-search-serializer'

describe('stringifySearch', () => {
  it('writes lists as readable comma-joined values', () => {
    expect(
      stringifySearch({
        model: ['openai/gpt-5', 'openai/gpt-5:free'],
        sort: '-throughput',
        with: ['tools'],
      }),
    ).toBe('?model=openai/gpt-5,openai/gpt-5:free&sort=-throughput&with=tools')
  })

  it('writes a single readable id without a JSON wrapper', () => {
    expect(stringifySearch({ model: ['openai/gpt-5:free'] })).toBe('?model=openai/gpt-5:free')
  })

  it('keeps JSON-like single values compact where the parser leaves them alone', () => {
    expect(stringifySearch({ model: ['01'] })).toBe('?model=01')
    expect(stringifySearch({ model: ['null'] })).not.toBe('?model=null')
  })
})
