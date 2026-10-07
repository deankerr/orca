import { describe, expect, test } from 'bun:test'

import { executeRequest, requestUrl } from './transport'
import type { Fetcher, Request } from './transport'

const destination = 'https://receiver.example/webhooks/id/token?thread_id=123'

function reply(body: string, status = 200, headers: Record<string, string> = {}): Fetcher {
  return async () => new Response(body, { headers, status })
}

describe('Discord HTTP contract', () => {
  test('requests confirmation and V2 while preserving thread routing', () => {
    const url = requestUrl({ operation: 'send', payload: '{"components":[]}', url: destination })
    expect(url.searchParams.get('wait')).toBe('true')
    expect(url.searchParams.get('with_components')).toBe('true')
    expect(url.searchParams.get('thread_id')).toBe('123')
  })

  test('addresses receipt operations on custom hosts without losing threads', () => {
    const request: Request = {
      messageId: '456',
      operation: 'edit',
      payload: '{"components":[]}',
      url: destination,
    }
    const url = requestUrl(request)
    expect(url.pathname).toBe('/webhooks/id/token/messages/456')
    expect(url.searchParams.get('thread_id')).toBe('123')
    expect(url.searchParams.get('with_components')).toBe('true')
    expect(url.searchParams.has('wait')).toBe(false)
  })

  test('preserves receipt and raw body', async () => {
    const body = '{"id":"456","content":"normalized"}'
    const result = await executeRequest(
      { operation: 'send', payload: '{"content":"hello"}', url: destination },
      reply(body),
    )
    expect(result.status).toBe(200)
    expect(result.messageId).toBe('456')
    expect(result.body).toBe(body)
  })

  test('honors the longest Discord cooldown including fractional seconds', async () => {
    const result = await executeRequest(
      { operation: 'send', url: destination },
      reply('{"retry_after":1.25}', 429, {
        'Retry-After': '1',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset-After': '2.5',
      }),
    )
    expect(result.retryAfterMs).toBe(2500)
    expect(result.status).toBe(429)
  })

  test('successful final bucket request still imposes a cooldown', async () => {
    const result = await executeRequest(
      { operation: 'send', url: destination },
      reply('{"id":"456"}', 200, {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset-After': '0.25',
      }),
    )
    expect(result.retryAfterMs).toBe(250)
  })

  test('network failure is an uncertain outcome without a fabricated HTTP status', async () => {
    const fetcher = async () => {
      throw new Error('connection lost')
    }
    const result = await executeRequest({ operation: 'send', url: destination }, fetcher)
    expect(result.status).toBeNull()
    expect(result.error).toBe('connection lost')
  })

  test('uses the proper methods and omits GET/DELETE request bodies', async () => {
    for (const [operation, method] of [
      ['get', 'GET'],
      ['edit', 'PATCH'],
      ['delete', 'DELETE'],
    ] as const) {
      const fetcher = async (_url: unknown, init?: RequestInit) => {
        expect(init?.method).toBe(method)
        expect(init?.body).toBe(operation === 'edit' ? '{}' : undefined)
        expect(init?.redirect).toBe('error')
        return new Response(null, { status: 204 })
      }
      const result = await executeRequest(
        { messageId: '456', operation, payload: '{}', url: destination },
        fetcher,
      )
      expect(result.status).toBe(204)
    }
  })
})
