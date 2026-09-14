import { describe, expect, it } from 'bun:test'

import { createSerializer } from 'nuqs/server'

import {
  endpointGridParsers,
  endpointGridResetPatch,
  hasEndpointGridQuery,
  normalizeEndpointGridQuery,
} from './query-state'

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

  it('resets grid state while preserving the pricing history overlay', () => {
    const serialize = createSerializer(endpointGridParsers)
    expect(
      serialize(
        '/?q=openai&uuid=abc123&has=reasoning&not=disabled&sort=inputPrice&order=asc&pricing-history=openai%2Fgpt-5.4',
        endpointGridResetPatch,
      ),
    ).toBe('/?pricing-history=openai/gpt-5.4')
  })
})
