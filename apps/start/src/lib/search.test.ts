import { defaultParseSearch } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { endpointSearchSchema } from '#features/endpoints/search'

import { stringifySearch } from './search'

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

  it('round-trips through the router parser and the search schema', () => {
    const search = endpointSearchSchema.parse({
      maxInput: 2.5,
      model: ['openai/gpt-5', 'moonshotai/kimi-k3'],
      plot: false,
      provider: ['302'],
      released: 6,
      sort: '-blend',
      without: ['training'],
    })

    expect(endpointSearchSchema.parse(defaultParseSearch(stringifySearch(search)))).toEqual(search)
  })
})
