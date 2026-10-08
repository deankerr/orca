import { describe, expect, test } from 'bun:test'

import { classifyResponse, retryAt, webhookResourceKey } from './retry'
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

describe('response scheduling decisions', () => {
  test('only confirmed 2xx results succeed, including an unreadable receipt', () => {
    expect(
      classifyResponse({ ...limited, error: 'body unavailable', status: 200 }, 0, NOW),
    ).toEqual({ cooldowns: [], kind: 'succeeded' })

    for (const status of [302, 400, 401, 403, 404]) {
      expect(classifyResponse({ ...limited, status }, 0, NOW)).toEqual({
        cooldowns: [],
        kind: 'failed',
      })
    }
  })

  test('network failures and 5xx responses retry the current job without blocking other receivers', () => {
    for (const status of [null, 500, 502, 503]) {
      expect(classifyResponse({ ...limited, status }, 2, NOW)).toEqual({
        cooldowns: [],
        kind: 'retry',
        retryAt: NOW + 4000,
      })
    }
  })

  test('a shared 429 applies to the webhook even when its ordinary bucket still has capacity', () => {
    expect(
      classifyResponse(
        {
          ...limited,
          body: '{"retry_after":2.5,"global":false}',
          headers: {
            'x-ratelimit-remaining': '4',
            'x-ratelimit-reset-after': '60',
            'x-ratelimit-scope': 'shared',
          },
        },
        0,
        NOW,
      ),
    ).toEqual({
      cooldowns: [{ availableAt: NOW + 2500, scope: 'webhook' }],
      kind: 'retry',
      retryAt: NOW + 2500,
    })
  })

  test('global limits are recognized independently from the body or either documented header', () => {
    const responses: ResponseSnapshot[] = [
      { ...limited, body: '{"global":true,"retry_after":2}' },
      {
        ...limited,
        body: '{"global":true,"retry_after":"invalid"}',
        headers: { 'retry-after': '2' },
      },
      {
        ...limited,
        body: 'unavailable',
        headers: { 'retry-after': '2', 'x-ratelimit-global': 'true' },
      },
      { ...limited, headers: { 'retry-after': '2', 'x-ratelimit-scope': 'global' } },
    ]

    for (const response of responses) {
      expect(classifyResponse(response, 0, NOW)).toEqual({
        cooldowns: [{ availableAt: NOW + 2000, scope: 'global' }],
        kind: 'retry',
        retryAt: NOW + 2000,
      })
    }
  })

  test('global and exhausted webhook gates remain independent when their reset times differ', () => {
    expect(
      classifyResponse(
        {
          ...limited,
          body: '{"global":true,"retry_after":2}',
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '10' },
        },
        0,
        NOW,
      ),
    ).toEqual({
      cooldowns: [
        { availableAt: NOW + 2000, scope: 'global' },
        { availableAt: NOW + 10_000, scope: 'webhook' },
      ],
      kind: 'retry',
      retryAt: NOW + 2000,
    })
  })

  test('an exhausted bucket applies after both success and permanent failure', () => {
    for (const status of [200, 400]) {
      expect(
        classifyResponse(
          {
            ...limited,
            headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '0.75' },
            status,
          },
          0,
          NOW,
        ),
      ).toEqual({
        cooldowns: [{ availableAt: NOW + 750, scope: 'webhook' }],
        kind: status === 200 ? 'succeeded' : 'failed',
      })
    }
  })

  test('thread and request options share a receiver resource while different webhook paths do not', () => {
    const endpoint = 'https://discord.com/api/webhooks/123/token'
    expect(webhookResourceKey(`${endpoint}?thread_id=1&wait=false`)).toBe(endpoint)
    expect(webhookResourceKey(`${endpoint}?thread_id=2&with_components=true`)).toBe(endpoint)
    expect(webhookResourceKey('https://receiver.example/hook?version=2#fragment')).toBe(
      'https://receiver.example/hook',
    )
    expect(webhookResourceKey('https://discord.com/api/webhooks/456/token')).not.toBe(endpoint)
  })
})
