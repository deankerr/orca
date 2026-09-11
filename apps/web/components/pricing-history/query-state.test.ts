import { describe, expect, it } from 'bun:test'

import {
  buildLegacyPricingHistoryHref,
  buildPricingHistoryHref,
  pricingHistoryModelIdFromParams,
  pricingHistoryQueryPatch,
} from './query-state'

describe('pricing history query patches', () => {
  it('treats blank values as closed', () => {
    expect(pricingHistoryModelIdFromParams('')).toBeNull()
    expect(pricingHistoryModelIdFromParams('  z-ai/glm-5.2  ')).toBe('z-ai/glm-5.2')
  })

  it('sets pricingHistory as its own key', () => {
    expect(pricingHistoryQueryPatch('z-ai/glm-5.2')).toEqual({ pricingHistory: 'z-ai/glm-5.2' })
    expect(pricingHistoryQueryPatch(null)).toEqual({ pricingHistory: null })
  })
})

describe('pricing history hrefs', () => {
  it('adds pricing-history to the current page filters', () => {
    expect(
      buildPricingHistoryHref({
        pathname: '/',
        searchParams: 'q=z-ai/glm-5.2&has=reasoning',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&has=reasoning&pricing-history=z-ai%2Fglm-5.2')

    expect(
      buildPricingHistoryHref({
        pathname: '/monitor',
        searchParams: 'model=z-ai/glm-5.2',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/monitor?model=z-ai%2Fglm-5.2&pricing-history=z-ai%2Fglm-5.2')
  })

  it('drops leftover overlay keys', () => {
    expect(
      buildPricingHistoryHref({
        pathname: '/',
        searchParams:
          'q=z-ai/glm-5.2&overviewModel=z-ai/glm-5.2&chart=z-ai/glm-5.2&history=z-ai/glm-5.2',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&pricing-history=z-ai%2Fglm-5.2')
  })

  it('builds a pricing-history-only href when no other state is present', () => {
    expect(
      buildPricingHistoryHref({
        pathname: '/',
        searchParams: '',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/?pricing-history=z-ai%2Fglm-5.2')
  })
})

describe('legacy pricing history redirects', () => {
  it('opens the overlay for a model id path', () => {
    expect(buildLegacyPricingHistoryHref(['z-ai', 'glm-5.2'])).toBe(
      '/?pricing-history=z-ai%2Fglm-5.2',
    )
  })

  it('decodes a single encoded segment', () => {
    expect(buildLegacyPricingHistoryHref(['z-ai%2Fglm-5.2'])).toBe(
      '/?pricing-history=z-ai%2Fglm-5.2',
    )
  })

  it('falls back to the grid when the path is empty', () => {
    expect(buildLegacyPricingHistoryHref([])).toBe('/')
    expect(buildLegacyPricingHistoryHref(['  '])).toBe('/')
  })
})
