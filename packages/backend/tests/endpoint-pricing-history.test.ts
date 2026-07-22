import { describe, expect, test } from 'bun:test'

import type {
  PricingHistoryChange,
  PricingHistoryEndpoint,
} from '../convex/endpointPricingHistory/reconstruct'
import {
  reconstructPricingHistory,
  takeRecentCompleteCrawls,
} from '../convex/endpointPricingHistory/reconstruct'

const endpoint: PricingHistoryEndpoint = {
  uuid: 'endpoint-1',
  provider: {
    slug: 'provider',
    tag_slug: 'provider-us',
    name: 'Provider',
    model_id: 'model-v1',
  },
  pricing: { text_input: 3, text_output: 4 },
}

function change(
  input: Partial<PricingHistoryChange> & Pick<PricingHistoryChange, 'crawl_id' | 'change_kind'>,
): PricingHistoryChange {
  return {
    previous_crawl_id: String(Number(input.crawl_id) - 1),
    endpoint_uuid: endpoint.uuid,
    ...input,
  }
}

describe('reconstructPricingHistory', () => {
  test('reconstructs prices and availability from the terminal state', () => {
    const result = reconstructPricingHistory({
      endpoints: [endpoint],
      since: 100,
      asOf: 400,
      changes: [
        change({
          crawl_id: '300',
          change_kind: 'update',
          path: 'pricing.text_input',
          before: 2,
          after: 3,
        }),
        change({ crawl_id: '200', change_kind: 'create' }),
      ],
    })

    expect(result[0]?.points).toEqual([
      { at: 100, available: false, pricing: {} },
      { at: 200, available: true, pricing: { text_input: 2, text_output: 4 } },
      { at: 300, available: true, pricing: { text_input: 3, text_output: 4 } },
      { at: 400, available: true, pricing: { text_input: 3, text_output: 4 } },
    ])
  })

  test('does not leak current prices across a reappearance boundary', () => {
    const result = reconstructPricingHistory({
      endpoints: [endpoint],
      since: 100,
      asOf: 500,
      changes: [
        change({ crawl_id: '400', change_kind: 'create' }),
        change({ crawl_id: '300', change_kind: 'delete' }),
        change({ crawl_id: '200', change_kind: 'create' }),
      ],
    })

    expect(result[0]?.points).toEqual([
      { at: 100, available: false, pricing: {} },
      { at: 200, available: true, pricing: {} },
      { at: 300, available: false, pricing: {} },
      { at: 400, available: true, pricing: { text_input: 3, text_output: 4 } },
      { at: 500, available: true, pricing: { text_input: 3, text_output: 4 } },
    ])
  })

  test('projects a historical raw price that is absent from the current endpoint', () => {
    const result = reconstructPricingHistory({
      endpoints: [endpoint],
      since: 100,
      asOf: 400,
      changes: [
        change({
          crawl_id: '300',
          change_kind: 'update',
          path: 'pricing.cache_read',
          before: 0.0000002,
          after: undefined,
        }),
        change({ crawl_id: '200', change_kind: 'create' }),
      ],
    })

    expect(result[0]?.points).toEqual([
      { at: 100, available: false, pricing: {} },
      {
        at: 200,
        available: true,
        pricing: { text_cache_read: 0.0000002, text_input: 3, text_output: 4 },
      },
      { at: 300, available: true, pricing: { text_input: 3, text_output: 4 } },
      { at: 400, available: true, pricing: { text_input: 3, text_output: 4 } },
    ])
  })

  test('omits endpoints that were unavailable for the entire window', () => {
    const result = reconstructPricingHistory({
      endpoints: [{ ...endpoint, unavailable_at: 50 }],
      since: 100,
      asOf: 400,
      changes: [],
    })

    expect(result).toEqual([])
  })
})

describe('takeRecentCompleteCrawls', () => {
  test('preserves the complete history below the limit', () => {
    const changes = [
      change({ crawl_id: '300', change_kind: 'update' }),
      change({ crawl_id: '200', change_kind: 'create' }),
    ]

    expect(takeRecentCompleteCrawls(changes, 2)).toEqual({
      changes,
      oldestExactTimestamp: undefined,
      truncated: false,
    })
  })

  test('never splits a crawl at the limit boundary', () => {
    const changes = [
      change({ crawl_id: '500', change_kind: 'update', previous_crawl_id: '400' }),
      change({ crawl_id: '400', change_kind: 'update', previous_crawl_id: '300' }),
      change({ crawl_id: '400', change_kind: 'update', previous_crawl_id: '300' }),
      change({ crawl_id: '300', change_kind: 'create', previous_crawl_id: '200' }),
    ]

    expect(takeRecentCompleteCrawls(changes, 2)).toEqual({
      changes: changes.slice(0, 1),
      oldestExactTimestamp: 400,
      truncated: true,
    })
  })

  test('falls back to the newest exact state when one crawl exceeds the limit', () => {
    const changes = [
      change({ crawl_id: '500', change_kind: 'update', previous_crawl_id: '400' }),
      change({ crawl_id: '500', change_kind: 'update', previous_crawl_id: '400' }),
      change({ crawl_id: '500', change_kind: 'update', previous_crawl_id: '400' }),
    ]

    expect(takeRecentCompleteCrawls(changes, 2)).toEqual({
      changes: [],
      oldestExactTimestamp: 500,
      truncated: true,
    })
  })
})
