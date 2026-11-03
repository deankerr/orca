import { describe, expect, it } from 'vitest'

import { rowWith } from './fixtures.testing'
import { NOT_IN_FILTERS, endpointTag, positionText, slugLine, unlistedLine } from './header'

describe('endpointTag', () => {
  it('joins the region and tier an endpoint states', () => {
    expect(endpointTag(rowWith({ endpoint: { provider_region: 'global' } }))).toBe('global')
    expect(
      endpointTag(rowWith({ endpoint: { provider_region: 'us', service_tier: 'flex' } })),
    ).toBe('us · flex')
  })

  it('has none when neither is stated', () => {
    expect(endpointTag(rowWith())).toBeNull()
  })
})

describe('slugLine', () => {
  it('shows the provider tag and the first eight characters of the endpoint ID', () => {
    const row = rowWith({
      endpoint: {
        provider: {
          display_name: 'OpenAI',
          id: 'openai',
          name: 'OpenAI',
          tag: 'openai/global',
        },
      },
    })

    expect(slugLine(row)).toBe('openai/global · 90d0dbe6')
  })
})

describe('unlistedLine', () => {
  it('dates an unlisted endpoint', () => {
    expect(unlistedLine(rowWith({ endpoint: { unlisted_at: '2026-10-24T05:00:00.000Z' } }))).toBe(
      'Unlisted since 2026-10-24',
    )
  })

  it('has no line for a listed endpoint', () => {
    expect(unlistedLine(rowWith())).toBeNull()
  })
})

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('positionText', () => {
  it('counts from one within the filtered rows', () => {
    expect(positionText(rows, 'a')).toBe('ENDPOINT 1 OF 3')
    expect(positionText(rows, 'c')).toBe('ENDPOINT 3 OF 3')
  })

  it('says so when the filters exclude the endpoint', () => {
    expect(positionText(rows, 'z')).toBe(NOT_IN_FILTERS)
    expect(positionText([], 'a')).toBe('NOT IN CURRENT FILTERS')
  })
})
