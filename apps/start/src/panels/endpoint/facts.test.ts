import { describe, expect, it } from 'vitest'

import { linkText, listRow, modelSections, providerSections } from './facts'
import type { Section } from './facts'
import { rowWith } from './fixtures.testing'

const byId = (rows: { id: string }[], id: string) => rows.find((row) => row.id === id)

describe('linkText', () => {
  it('shows the hostname alone, without scheme, www, or path', () => {
    expect(linkText('https://www.status.example.com/')).toBe('status.example.com')
    expect(linkText('https://huggingface.co/a/b')).toBe('huggingface.co')
    expect(linkText('https://example.com/legal/')).toBe('example.com')
  })
})

describe('listRow', () => {
  it('keeps a short list on the label line', () => {
    expect(listRow('a', 'A', ['x', 'y', 'z'])).toEqual({ id: 'a', label: 'A', value: 'x, y, z' })
  })

  it('stacks a long list as items under the label', () => {
    expect(listRow('a', 'A', ['w', 'x', 'y', 'z'])).toMatchObject({
      items: ['w', 'x', 'y', 'z'],
      value: 'w, x, y, z',
    })
  })

  it('shows a dash for a list the Contract does not know', () => {
    expect(listRow('a', 'A', null)).toEqual({ id: 'a', label: 'A', value: '—' })
  })
})

const rowsOf = (sections: Section[], id: string) =>
  sections.find((section) => section.id === id)?.rows ?? []

describe('modelSections', () => {
  it('groups identity, capabilities, and dates and limits, with absent facts as a dash', () => {
    const sections = modelSections(
      rowWith({
        model: { author: { id: 'openai', name: 'OpenAI' }, input_modalities: ['text', 'image'] },
      }),
    )

    expect(sections.map(({ id }) => id)).toEqual([
      'identity',
      'capabilities',
      'dates-limits',
      'links',
    ])

    expect(byId(rowsOf(sections, 'identity'), 'author')).toMatchObject({ value: 'OpenAI' })
    expect(byId(rowsOf(sections, 'capabilities'), 'input')).toMatchObject({ value: 'text, image' })
    expect(byId(rowsOf(sections, 'dates-limits'), 'released')).toMatchObject({
      value: '2026-10-10',
    })
    expect(byId(rowsOf(sections, 'dates-limits'), 'cutoff')).toMatchObject({ value: '—' })
    expect(byId(rowsOf(sections, 'capabilities'), 'weights')).toMatchObject({ value: 'no' })
  })

  it('copies the model ID', () => {
    expect(byId(rowsOf(modelSections(rowWith()), 'identity'), 'id')).toMatchObject({
      copyLabel: 'Copy model ID',
      value: 'openai/gpt-5',
    })
  })

  it('reads a knowledge cutoff as a date when it is a timestamp, else as stated', () => {
    const cutoff = (knowledge_cutoff: string) =>
      byId(
        rowsOf(modelSections(rowWith({ model: { knowledge_cutoff } })), 'dates-limits'),
        'cutoff',
      )

    expect(cutoff('2025-01-31T23:59:59.000Z')).toMatchObject({ value: '2025-01-31' })
    expect(cutoff('mid 2025')).toMatchObject({ value: 'mid 2025' })
  })

  it('links the OpenRouter page, and Hugging Face for open weights', () => {
    const links = (hf_slug: string | null) =>
      modelSections(rowWith({ model: { hf_slug } })).find(({ id }) => id === 'links')?.links

    expect(links(null)).toEqual(['https://openrouter.ai/openai/gpt-5'])
    expect(links('moonshotai/Kimi-K3')).toEqual([
      'https://openrouter.ai/openai/gpt-5',
      'https://huggingface.co/moonshotai/Kimi-K3',
    ])
  })

  it('gives the description a section of its own, unless there is none', () => {
    const description = (text: string) =>
      modelSections(rowWith({ model: { description: text } })).find(
        ({ id }) => id === 'description',
      )

    expect(description('  Fast.  ')?.text).toBe('Fast.')
    expect(description(' ')).toBeUndefined()
  })

  it('shows only the reasoning settings the model states', () => {
    const rows = rowsOf(
      modelSections(
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
      ),
      'capabilities',
    )

    expect(byId(rows, 'efforts')).toMatchObject({ value: 'low, high' })
    expect(byId(rows, 'default-effort')).toMatchObject({ value: 'high' })
    expect(byId(rows, 'mandatory')).toBeUndefined()
    expect(byId(rows, 'budget')).toBeUndefined()
  })
})

describe('providerSections', () => {
  it('links the pages the Contract has and dashes the rest', () => {
    const sections = providerSections(
      rowWith({
        provider: {
          datacenters: ['US', 'DE'],
          headquarters: 'US',
          privacy_policy_url: 'https://example.com/privacy',
          status_page_url: 'https://status.example.com/',
        },
      }),
    )

    const links = rowsOf(sections, 'links')

    expect(byId(rowsOf(sections, 'locations'), 'headquarters')).toMatchObject({ value: 'US' })
    expect(byId(rowsOf(sections, 'locations'), 'datacenters')).toMatchObject({ value: 'US, DE' })
    expect(byId(links, 'status')).toMatchObject({
      href: 'https://status.example.com/',
      value: 'status.example.com',
    })
    expect(byId(links, 'privacy')).toMatchObject({ href: 'https://example.com/privacy' })
    expect(byId(links, 'terms')).toMatchObject({ value: '—' })
    expect(byId(links, 'terms')).not.toHaveProperty('href')
    expect(sections.find(({ id }) => id === 'links')?.links).toEqual([
      'https://openrouter.ai/provider/openai',
    ])
  })

  it('copies the provider ID', () => {
    expect(byId(rowsOf(providerSections(rowWith()), 'identity'), 'id')).toMatchObject({
      copyLabel: 'Copy provider ID',
      value: 'openai',
    })
  })
})
