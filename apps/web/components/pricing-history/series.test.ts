import { describe, expect, test } from 'bun:test'

import type { PricingSeries } from './series'
import { groupSeriesByProvider, providerPriceAt } from './series'

function pricingSeries({
  endpointUuid,
  providerId,
  points,
}: {
  endpointUuid: string
  providerId: string
  points: PricingSeries['points']
}): PricingSeries {
  return {
    endpointUuid,
    provider: {
      model_id: 'model',
      name: providerId,
      slug: providerId,
      tag_slug: providerId,
    },
    points,
  }
}

describe('provider pricing series', () => {
  test('groups replacement endpoint UUIDs under their shared provider tag', () => {
    const first = pricingSeries({ endpointUuid: 'first', providerId: 'provider-a', points: [] })
    const second = pricingSeries({ endpointUuid: 'second', providerId: 'provider-b', points: [] })
    const replacement = pricingSeries({
      endpointUuid: 'replacement',
      providerId: 'provider-a',
      points: [],
    })

    expect(groupSeriesByProvider([first, second, replacement])).toEqual([
      { providerId: 'provider-a', series: [first, replacement] },
      { providerId: 'provider-b', series: [second] },
    ])
  })

  test('reads the active replacement endpoint as one provider history', () => {
    const original = pricingSeries({
      endpointUuid: 'original',
      providerId: 'provider-a',
      points: [
        { at: 0, available: true, pricing: { text_input: 1 } },
        { at: 10, available: false, pricing: { text_input: 1 } },
      ],
    })
    const replacement = pricingSeries({
      endpointUuid: 'replacement',
      providerId: 'provider-a',
      points: [
        { at: 0, available: false, pricing: {} },
        { at: 20, available: true, pricing: { text_input: 2 } },
      ],
    })
    const [provider] = groupSeriesByProvider([original, replacement])
    if (provider === undefined) {
      throw new Error('Expected provider group')
    }

    expect(providerPriceAt(provider, 'text_input', 5)).toBe(1)
    expect(providerPriceAt(provider, 'text_input', 15)).toBeUndefined()
    expect(providerPriceAt(provider, 'text_input', 25)).toBe(2)
  })
})
