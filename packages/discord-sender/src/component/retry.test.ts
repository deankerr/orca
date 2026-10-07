import { describe, expect, test } from 'bun:test'

import { retryAt } from './retry'
import type { ResponseSnapshot } from './transport'

const NOW = Date.UTC(2026, 9, 8, 10)
const limited: ResponseSnapshot = { body: '', headers: {}, status: 429 }

describe('receiver retry hints', () => {
  test('fractional body durations and Retry-After govern a shared limit independently of bucket reset', () => {
    expect(
      retryAt(
        {
          ...limited,
          body: '{"retry_after":1.5,"global":false}',
          headers: {
            'retry-after': '2.25',
            'x-ratelimit-remaining': '4',
            'x-ratelimit-reset-after': '99',
          },
        },
        0,
        NOW,
      ),
    ).toBe(NOW + 2250)
  })

  test('HTTP-date Retry-After works when the response body is unavailable', () => {
    expect(
      retryAt(
        {
          ...limited,
          body: 'not JSON',
          headers: { 'retry-after': new Date(NOW + 5000).toUTCString() },
        },
        0,
        NOW,
      ),
    ).toBe(NOW + 5000)
  })

  test('a bucket duration is a fallback, and unusable hints use bounded backoff', () => {
    expect(
      retryAt(
        {
          ...limited,
          body: '{"retry_after":"invalid"}',
          headers: { 'retry-after': 'invalid', 'x-ratelimit-reset-after': '3.5' },
        },
        0,
        NOW,
      ),
    ).toBe(NOW + 3500)
    expect(retryAt({ ...limited, headers: { 'retry-after': '-1' } }, 2, NOW)).toBe(NOW + 4000)
    expect(retryAt({ ...limited, body: '{"retry_after":0}' }, 0, NOW)).toBe(NOW + 1000)
    expect(retryAt({ ...limited, status: 503 }, 100, NOW)).toBe(NOW + 60_000)
  })

  test('unreasonably large duration hints remain finite for deadline clamping', () => {
    const cases: Array<Record<string, string>> = [
      { 'retry-after': '1e308' },
      { 'x-ratelimit-reset-after': '1e308' },
    ]
    for (const headers of cases) {
      const at = retryAt({ ...limited, headers }, 0, NOW)
      expect(Number.isFinite(at)).toBe(true)
      expect(at).toBeGreaterThan(NOW)
    }
  })

  test('permanent rejections and successful receipts are not retried', () => {
    for (const status of [200, 204, 400, 401, 403, 404]) {
      expect(retryAt({ ...limited, status }, 0, NOW)).toBeNull()
    }
    expect(retryAt({ ...limited, status: null }, 0, NOW)).toBe(NOW + 1000)
    expect(retryAt({ ...limited, status: 502 }, 1, NOW)).toBe(NOW + 2000)
  })
})
