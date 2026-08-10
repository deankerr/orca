import { describe, expect, test } from 'bun:test'

import { batchIdAt, EndpointsQuery } from '@orca/schema/artifacts.ts'
import type { CatalogModel } from '@orca/schema/openrouter.ts'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

import { isCrawlable, workList } from '../src/crawl/work-list.ts'

const decodeQuery = Schema.decodeUnknownSync(EndpointsQuery)

const model = (
  partial: Partial<CatalogModel> & Pick<CatalogModel, 'slug' | 'permaslug'>,
): CatalogModel => ({
  author: partial.author ?? 'acme',
  endpoint: partial.endpoint === undefined ? { variant: 'standard' } : partial.endpoint,
  permaslug: partial.permaslug,
  slug: partial.slug,
})

describe('isCrawlable', () => {
  test('drops null endpoint and tilde aliases', () => {
    expect(isCrawlable(model({ permaslug: 'acme/a', slug: 'acme/a' }))).toBe(true)
    expect(isCrawlable(model({ endpoint: null, permaslug: 'acme/a', slug: 'acme/a' }))).toBe(false)
    expect(isCrawlable(model({ permaslug: 'acme/a', slug: '~acme/a' }))).toBe(false)
  })
})

describe('workList', () => {
  test('builds queries for crawlable models only', () => {
    const batch = Effect.runSync(Effect.map(DateTime.now, batchIdAt))
    const queries = workList(batch, [
      model({
        endpoint: { variant: 'free' },
        permaslug: 'anthropic/claude',
        slug: 'anthropic/claude',
      }),
      model({ endpoint: null, permaslug: 'gone/model', slug: 'gone/model' }),
      model({ permaslug: 'anthropic/claude', slug: '~anthropic/claude' }),
      model({ permaslug: 'openai/gpt', slug: 'openai/gpt' }),
    ])

    expect(queries).toEqual([
      decodeQuery({ batch, permaslug: 'anthropic/claude', variant: 'free' }),
      decodeQuery({ batch, permaslug: 'openai/gpt', variant: 'standard' }),
    ])
  })
})
