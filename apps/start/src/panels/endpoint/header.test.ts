import { describe, expect, it } from 'vitest'

import { rowWith } from './fixtures.testing'
import { endpointTag, endpointTagDescription, slugParts, unlistedLine } from './header'

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

describe('endpointTagDescription', () => {
  it('explains each property behind the tag', () => {
    expect(
      endpointTagDescription(
        rowWith({ endpoint: { provider_region: 'us', service_tier: 'flex' } }),
      ),
    ).toBe(
      'Region: Reported serving region; it does not establish data residency. Service Tier: Paid speed or priority tier, or discounted flex tier.',
    )
    expect(endpointTagDescription(rowWith())).toBe('')
  })
})

describe('slugParts', () => {
  it('splits the provider tag from the endpoint ID, with its first eight characters for display', () => {
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

    expect(slugParts(row)).toEqual({
      id: '90d0dbe6-0000-4000-8000-000000000000',
      shortId: '90d0dbe6',
      tag: 'openai/global',
    })
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
