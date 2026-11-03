import { describe, expect, it } from 'vitest'

import { linkText, modelRows, providerRows } from './facts'
import { rowWith } from './fixtures.testing'

const byId = (rows: { id: string }[], id: string) => rows.find((row) => row.id === id)

describe('linkText', () => {
  it('drops the scheme, www, and trailing slash', () => {
    expect(linkText('https://www.status.example.com/')).toBe('status.example.com')
    expect(linkText('https://huggingface.co/a/b')).toBe('huggingface.co/a/b')
    expect(linkText('https://example.com/legal/')).toBe('example.com/legal')
  })
})

describe('modelRows', () => {
  it('states model facts, with absent ones as a dash', () => {
    const rows = modelRows(
      rowWith({
        model: { author: { id: 'openai', name: 'OpenAI' }, input_modalities: ['text', 'image'] },
      }),
    )

    expect(byId(rows, 'author')).toMatchObject({ value: 'OpenAI' })
    expect(byId(rows, 'released')).toMatchObject({ value: '2026-10-10' })
    expect(byId(rows, 'input')).toMatchObject({ value: 'text, image' })
    expect(byId(rows, 'cutoff')).toMatchObject({ value: '—' })
    expect(
      byId(
        modelRows(rowWith({ model: { knowledge_cutoff: '2025-01-31T23:59:59.000Z' } })),
        'cutoff',
      ),
    ).toMatchObject({ value: '2025-01-31' })
    expect(
      byId(modelRows(rowWith({ model: { knowledge_cutoff: 'mid 2025' } })), 'cutoff'),
    ).toMatchObject({ value: 'mid 2025' })
    expect(byId(rows, 'weights')).toMatchObject({ value: 'no' })
  })

  it('links open weights to Hugging Face', () => {
    expect(
      byId(modelRows(rowWith({ model: { hf_slug: 'moonshotai/Kimi-K3' } })), 'weights'),
    ).toMatchObject({
      href: 'https://huggingface.co/moonshotai/Kimi-K3',
      value: 'huggingface.co/moonshotai/Kimi-K3',
    })
  })

  it('shows only the reasoning settings the model states', () => {
    const rows = modelRows(
      rowWith({
        model: {
          reasoning_config: {
            default_reasoning_effort: 'high',
            default_reasoning_enabled: null,
            is_mandatory_reasoning: null,
            reasoning_return_mechanism: null,
            supported_reasoning_efforts: ['low', 'high'],
            supports_reasoning_max_tokens: null,
          },
          supports_reasoning: true,
        },
      }),
    )

    expect(byId(rows, 'efforts')).toMatchObject({ value: 'low, high' })
    expect(byId(rows, 'default-effort')).toMatchObject({ value: 'high' })
    expect(byId(rows, 'mandatory')).toBeUndefined()
    expect(byId(rows, 'budget')).toBeUndefined()
  })
})

describe('providerRows', () => {
  it('links the pages the Contract has and dashes the rest', () => {
    const rows = providerRows(
      rowWith({
        provider: {
          datacenters: ['US', 'DE'],
          headquarters: 'US',
          privacy_policy_url: 'https://example.com/privacy',
          status_page_url: 'https://status.example.com/',
        },
      }),
    )

    expect(byId(rows, 'headquarters')).toMatchObject({ value: 'US' })
    expect(byId(rows, 'datacenters')).toMatchObject({ value: 'US, DE' })
    expect(byId(rows, 'status')).toMatchObject({
      href: 'https://status.example.com/',
      value: 'status.example.com',
    })
    expect(byId(rows, 'privacy')).toMatchObject({ href: 'https://example.com/privacy' })
    expect(byId(rows, 'terms')).toMatchObject({ value: '—' })
    expect(byId(rows, 'terms')).not.toHaveProperty('href')
  })
})
