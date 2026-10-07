import { describe, expect, test } from 'bun:test'

import { executeWebhook } from './transport'

const url = 'https://receiver.example/webhook?thread_id=123&wait=false'

describe('webhook transport', () => {
  test('sends the exact payload, requests a receipt and enables components', async () => {
    const payload = '{"components":[],"flags":32768}'
    const body = '{"id":"456","channel_id":"789","content":"normalized"}'

    const result = await executeWebhook({ payload, url }, async (input, options) => {
      const request = new Request(input, options)
      const destination = new URL(request.url)
      expect(destination.searchParams.get('thread_id')).toBe('123')
      expect(destination.searchParams.get('wait')).toBe('true')
      expect(destination.searchParams.get('with_components')).toBe('true')
      expect(await request.text()).toBe(payload)
      expect(request.headers.get('content-type')).toBe('application/json')
      expect(request.method).toBe('POST')
      expect(request.redirect).toBe('error')
      expect(request.signal).toBeInstanceOf(AbortSignal)
      return new Response(body, { headers: { 'X-RateLimit-Remaining': '4' }, status: 200 })
    })

    expect(result).toMatchObject({
      body,
      channelId: '789',
      headers: { 'x-ratelimit-remaining': '4' },
      messageId: '456',
      status: 200,
    })
  })

  test('retains HTTP errors and headers without retrying', async () => {
    let requests = 0

    const result = await executeWebhook({ payload: '{"content":"hello"}', url }, async () => {
      requests += 1
      return new Response('{"retry_after":2}', {
        headers: { 'Retry-After': '2' },
        status: 429,
      })
    })

    expect(requests).toBe(1)

    expect(result).toMatchObject({
      body: '{"retry_after":2}',
      headers: { 'retry-after': '2' },
      status: 429,
    })
  })

  test('records network errors without inventing an HTTP result', async () => {
    const result = await executeWebhook({ payload: '{}', url }, async () => {
      throw new Error('connection lost')
    })

    expect(result).toEqual({
      body: '',
      error: 'connection lost',
      headers: {},
      status: null,
    })
  })

  test('preserves a confirmed HTTP result when reading the body fails', async () => {
    const result = await executeWebhook(
      { payload: '{}', url },
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('body lost'))
            },
          }),
          { headers: { 'X-RateLimit-Remaining': '3' }, status: 200 },
        ),
    )

    expect(result).toMatchObject({
      body: '',
      error: 'Response body unavailable: body lost',
      headers: { 'x-ratelimit-remaining': '3' },
      status: 200,
    })

    expect(result.messageId).toBeUndefined()
  })

  test('keeps non-JSON response bodies and independently extracts valid receipt fields', async () => {
    const cases = [
      { body: 'gateway unavailable', expected: {}, status: 502 },
      { body: '{"id":123,"channel_id":"789"}', expected: { channelId: '789' }, status: 200 },
      { body: '{"id":"456","channel_id":null}', expected: { messageId: '456' }, status: 200 },
    ]
    for (const { body, expected, status } of cases) {
      const result = await executeWebhook(
        { payload: '{}', url },
        async () => new Response(body, { headers: { 'Content-Type': 'application/json' }, status }),
      )

      expect(result).toEqual({
        ...expected,
        body,
        headers: { 'content-type': 'application/json' },
        status,
      })
    }
  })
})
