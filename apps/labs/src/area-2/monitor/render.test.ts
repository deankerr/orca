import { describe, expect, test } from 'bun:test'

import { renderMonitor } from './render.ts'

describe('Area 2 static monitor', () => {
  test('renders price changes as a rate table and escapes JSON content', () => {
    const html = renderMonitor(
      {
        crawls: 2,
        eventCount: 2,
        firstCrawlId: '1000',
        generatedAt: '2026-08-06T00:00:00.000Z',
        lastCrawlId: '2000',
      },
      [
        {
          changeKind: 'updated',
          changeset: [
            {
              changes: [
                {
                  changes: [{ key: 'prompt', oldValue: '0.1', type: 'UPDATE', value: '0.2' }],
                  key: 'pricing',
                  type: 'UPDATE',
                },
              ],
              key: 'endpoint',
              type: 'UPDATE',
            },
          ],
          context: { pricing: { completion: '0.3', prompt: '0.2' } },
          contextKind: 'pricing',
          crawlId: '2000',
          entityId: '<endpoint>',
          entityType: 'endpoint',
          modelName: 'Model',
          modelSlug: 'author/model',
          providerDisplayName: 'Provider display',
          providerName: 'Provider',
          providerSlug: 'provider',
        },
      ],
      100,
    )

    expect(html).toContain('Pricing change')
    expect(html).toContain('<td>$100000 / M tokens</td>')
    expect(html).toContain('<td>$200000 / M tokens</td>')
    expect(html).toContain('Rate card after pricing change')
    expect(html).toContain('&lt;endpoint&gt;')
  })

  test('summarizes ordinary updates and keeps lifecycle state singular', () => {
    const html = renderMonitor(
      {
        crawls: 2,
        eventCount: 2,
        firstCrawlId: '1000',
        generatedAt: '2026-08-06T00:00:00.000Z',
        lastCrawlId: '2000',
      },
      [
        {
          changeKind: 'updated',
          changeset: [
            {
              changes: [
                { key: 'context_length', oldValue: 32_768, type: 'UPDATE', value: 65_536 },
                { key: 'max_completion_tokens', type: 'REMOVE', value: null },
                { key: 'max_completion_tokens', type: 'ADD', value: 131_072 },
                {
                  changes: [{ key: 'tools', type: 'ADD', value: 'tools' }],
                  embeddedKey: '$value',
                  key: 'supported_parameters',
                  type: 'UPDATE',
                },
              ],
              key: 'endpoint',
              type: 'UPDATE',
            },
          ],
          context: undefined,
          contextKind: 'none',
          crawlId: '2000',
          entityId: 'endpoint',
          entityType: 'endpoint',
          modelName: 'Model',
          modelSlug: 'author/model',
          providerDisplayName: 'Provider display',
          providerName: 'Provider',
          providerSlug: 'provider',
        },
        {
          changeKind: 'available',
          changeset: [{ key: '$root', type: 'ADD', value: {} }],
          context: { endpoint: { id: 'endpoint' } },
          contextKind: 'entity',
          crawlId: '1000',
          entityId: 'endpoint',
          entityType: 'endpoint',
          modelName: 'Model',
          modelSlug: 'author/model',
          providerDisplayName: 'Provider display',
          providerName: 'Provider',
          providerSlug: 'provider',
        },
      ],
      20,
    )

    expect(html).toContain('context length: 32,768 -&gt; 65,536')
    expect(html).toContain('max completion tokens: null -&gt; 131,072')
    expect(html).toContain('supported parameters: +tools')
    expect(html).toContain('Selected entity state')
    expect(html.match(/Changeset JSON/g)).toHaveLength(1)
  })

  test('keeps zero values in price changes but hides optional zero rate-card rows', () => {
    const html = renderMonitor(
      {
        crawls: 2,
        eventCount: 2,
        firstCrawlId: '1000',
        generatedAt: '2026-08-06T00:00:00.000Z',
        lastCrawlId: '2000',
      },
      [
        {
          changeKind: 'updated',
          changeset: [
            {
              changes: [
                {
                  changes: [
                    {
                      key: 'input_cache_read',
                      oldValue: '0.00000001',
                      type: 'UPDATE',
                      value: '0',
                    },
                  ],
                  key: 'pricing',
                  type: 'UPDATE',
                },
              ],
              key: 'endpoint',
              type: 'UPDATE',
            },
          ],
          context: {
            pricing: { completion: '0', discount: 0, input_cache_read: '0', prompt: '0' },
          },
          contextKind: 'pricing',
          crawlId: '2000',
          entityId: 'endpoint',
          entityType: 'endpoint',
          modelName: 'Model',
          modelSlug: 'author/model',
          providerDisplayName: 'Provider display',
          providerName: 'Provider',
          providerSlug: 'provider',
        },
      ],
      20,
    )

    expect(html).toContain('<td>$0.01 / M tokens</td>')
    expect(html).toContain('<td>$0 / M tokens</td>')
    expect(html).not.toContain('<dt>input cache read</dt>')
    expect(html).not.toContain('<dt>discount</dt>')
  })
})
