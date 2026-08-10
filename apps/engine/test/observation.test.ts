import { describe, expect, test } from 'bun:test'

import { encodeScopeKey, parseEndpointsBody } from '../src/current/observation.ts'

describe('parseEndpointsBody', () => {
  test('keeps raw payloads and only requires string ids', () => {
    const body = JSON.stringify({
      data: [
        { id: 'ep-1', model: { slug: 'acme/model' }, pricing: { prompt: '0.001' } },
        { id: 'ep-2', nested: { anything: true } },
        { not_an_endpoint: true },
        { id: '' },
        null,
        'skip',
      ],
      headers: { date: 'ignored' },
    })

    expect(parseEndpointsBody(body)).toEqual({
      endpoints: [
        {
          id: 'ep-1',
          payload: { id: 'ep-1', model: { slug: 'acme/model' }, pricing: { prompt: '0.001' } },
        },
        { id: 'ep-2', payload: { id: 'ep-2', nested: { anything: true } } },
      ],
    })
  })

  test('returns null for unusable bodies', () => {
    expect(parseEndpointsBody('not-json')).toBeNull()
    expect(parseEndpointsBody('{}')).toBeNull()
    expect(parseEndpointsBody(JSON.stringify({ data: [] }))).toBeNull()
    expect(parseEndpointsBody(JSON.stringify({ data: [{ id: '' }] }))).toBeNull()
  })
})

describe('encodeScopeKey', () => {
  test('joins permaslug and variant', () => {
    expect(encodeScopeKey('anthropic/claude-3', 'standard')).toBe('anthropic/claude-3|standard')
  })
})
