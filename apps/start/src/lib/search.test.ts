import { defaultParseSearch } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { endpointSearchSchema } from '#features/endpoints/search'

import { stringifySearch } from './search'

type EndpointSearchInput = z.input<typeof endpointSearchSchema>

/** Through the router's parser and the search schema, as a navigation to the URL would read it. */
const roundTrip = (search: EndpointSearchInput) =>
  endpointSearchSchema.parse(defaultParseSearch(stringifySearch(search)))

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

describe('list round-trips', () => {
  const singles = [
    'null',
    'true',
    'false',
    '1e3',
    '1.0',
    '0',
    '-1',
    '01',
    '302',
    ' 1',
    '"quoted"',
    '[1]',
    '{}',
    'openai/gpt-5:free',
    'trinity',
    'fast',
    'nullish',
  ]

  it.each(singles)('keeps the single value %j exact', (value) => {
    expect(roundTrip({ model: [value] }).model).toEqual([value])
    expect(roundTrip({ provider: [value] }).provider).toEqual([value])
  })

  it.each([
    ['null', 'true'],
    ['1e3', '0', '-1', '01'],
    ['"a', 'b"'],
    ['null', 'openai/gpt-5:free', '302'],
  ])('keeps the list %j exact', (...values) => {
    expect(roundTrip({ model: values }).model).toEqual(values)
  })

  it('keeps ids with URL metacharacters exact', () => {
    const values = ['100%', '%2C', '%2F', 'a#b', 'a&b=c', 'a+b', 'a b', "it's", 'say "hi"', 'a/b:c']

    for (const value of values) {
      expect(roundTrip({ model: [value] }).model).toEqual([value])
    }

    expect(roundTrip({ model: values }).model).toEqual(values)
  })

  it('keeps ids containing commas exact', () => {
    expect(roundTrip({ model: ['a,b', 'c'] }).model).toEqual(['a,b', 'c'])
  })

  it('keeps JSON-like single values compact where the parser leaves them alone', () => {
    expect(stringifySearch({ model: ['01'] })).toBe('?model=01')
    expect(stringifySearch({ model: ['null'] })).not.toBe('?model=null')
  })

  it('applies to every list param, and the property lists keep known ids', () => {
    expect(roundTrip({ with: ['tools'], without: ['zdr'] })).toMatchObject({
      with: ['tools'],
      without: ['zdr'],
    })
  })
})

describe('scalar round-trips', () => {
  it('keeps numeric bounds', () => {
    const search = {
      maxInput: 2.5,
      minContext: 128_000,
      minTps: 0.5,
      released: 6,
    } satisfies EndpointSearchInput

    expect(roundTrip(search)).toMatchObject(search)
  })

  it('keeps booleans', () => {
    expect(roundTrip({ plot: false, unlisted: true })).toMatchObject({
      plot: false,
      unlisted: true,
    })
    expect(roundTrip({ plot: true, unlisted: false })).toMatchObject({
      plot: true,
      unlisted: false,
    })
  })

  it('keeps a selected endpoint whose id reads as JSON', () => {
    expect(roundTrip({ endpoint: 'null' }).endpoint).toBe('null')
    expect(roundTrip({ endpoint: '1e3' }).endpoint).toBe('1e3')
  })
})
