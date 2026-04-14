import { describe, expect, it } from 'bun:test'

import {
  buildEndpointGridHref,
  hasEndpointGridQuery,
  normalizeEndpointGridQuery,
} from './use-endpoint-query-state'

describe('endpoint grid query helpers', () => {
  it('treats whitespace-only input as empty', () => {
    expect(normalizeEndpointGridQuery('    ')).toBe('')
    expect(hasEndpointGridQuery('    ')).toBeFalse()
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeEndpointGridQuery('  openai/gpt-5.4  ')).toBe('openai/gpt-5.4')
    expect(hasEndpointGridQuery('  openai/gpt-5.4  ')).toBeTrue()
  })

  it('preserves internal whitespace when normalized', () => {
    expect(normalizeEndpointGridQuery('claude anthropic')).toBe('claude anthropic')
  })

  it('omits an empty q param when building links', () => {
    expect(buildEndpointGridHref({ query: '   ' })).toBe('/')
  })

  it('includes normalized query params when building links', () => {
    expect(buildEndpointGridHref({ query: '  openai/gpt-5.4  ', uuid: ' abc123 ' })).toBe(
      '/?q=openai%2Fgpt-5.4&uuid=abc123',
    )
  })
})
