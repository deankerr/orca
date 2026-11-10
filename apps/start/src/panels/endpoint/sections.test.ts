import { describe, expect, it } from 'vitest'

import { ABSENT } from '#lib/format'

import { rowWith } from './fixtures.testing'
import { endpointSections } from './sections'

const rowIn = (sectionId: string, rowId: string, change: Parameters<typeof rowWith>[0]) =>
  endpointSections(rowWith(change))
    .find(({ id }) => id === sectionId)
    ?.rows.find(({ id }) => id === rowId)

describe('web search in the Endpoint tab', () => {
  const native = { endpoint: { supports_native_web_search: true }, pricing: { web_search: '0.01' } }

  it('prices native search once, under Pricing', () => {
    expect(rowIn('pricing', 'web_search', native)?.value).toBe('$0.01 /req')
    expect(rowIn('tools', 'native_web_search', native)?.value).toBe('yes')
  })

  it('shows no price where the provider does not search natively', () => {
    const quoted = { pricing: { web_search: '0.01' } }

    expect(rowIn('pricing', 'web_search', quoted)).toBeUndefined()
    expect(rowIn('tools', 'native_web_search', quoted)).toBeUndefined()
  })

  it('shows native search with no price as a plain yes', () => {
    const unpriced = { endpoint: { supports_native_web_search: true } }

    expect(rowIn('pricing', 'web_search', unpriced)).toBeUndefined()
    expect(rowIn('tools', 'native_web_search', unpriced)?.value).toBe('yes')
  })
})

describe('cancellation in the Endpoint tab', () => {
  it('always shows under More, as yes or no', () => {
    expect(rowIn('more', 'cancellation', { endpoint: { can_abort: true } })?.value).toBe('yes')
    expect(rowIn('more', 'cancellation', { endpoint: { can_abort: false } })?.value).toBe('no')
    expect(rowIn('more', 'cancellation', { endpoint: { can_abort: null } })?.value).toBe(ABSENT)
  })
})

describe('limits in the Endpoint tab', () => {
  it('follows pricing, with context and max output always shown', () => {
    const sections = endpointSections(rowWith({ endpoint: { max_completion_tokens: null } }))

    expect(sections.map(({ id }) => id).slice(0, 2)).toEqual(['pricing', 'limits'])
    expect(rowIn('limits', 'context', { endpoint: { context_length: 1_048_576 } })?.value).toBe(
      '1,048,576',
    )
    expect(rowIn('limits', 'context', { endpoint: { context_length: null } })?.value).toBe(ABSENT)
    expect(
      rowIn('limits', 'max_output', { endpoint: { max_completion_tokens: null } })?.value,
    ).toBe(ABSENT)
  })

  it('holds the limit properties rather than More', () => {
    expect(rowIn('limits', 'limit_rpm', { endpoint: { limit_rpm: 20 } })?.value).toBe('20')
    expect(rowIn('more', 'limit_rpm', { endpoint: { limit_rpm: 20 } })).toBeUndefined()
  })
})

describe('output formats in the Endpoint tab', () => {
  it('names structured outputs as its own row', () => {
    const supported_parameters = ['response_format', 'structured_outputs']

    expect(
      rowIn('output', 'structured_outputs', { endpoint: { supported_parameters } }),
    ).toMatchObject({ label: 'Structured outputs', value: 'yes' })
  })
})
