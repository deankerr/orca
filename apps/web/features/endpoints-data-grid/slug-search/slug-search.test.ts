import { describe, expect, it } from 'bun:test'

import { createSlugSearcher } from './slug-search'

describe('createSlugSearcher', () => {
  it('matches hyphenated slug continuations', () => {
    const searcher = createSlugSearcher(
      [{ slug: 'openai/gpt-4' }, { slug: 'openai/gpt-4-0314' }, { slug: 'openai/gpt-4-turbo' }],
      {
        getFields: (record) => [{ name: 'slug', value: record.slug }],
      },
    )

    expect(searcher.search('gpt-4-').map((result) => result.record.slug)).toEqual([
      'openai/gpt-4-0314',
      'openai/gpt-4-turbo',
    ])
  })

  it('matches slash-prefixed provider tag variants', () => {
    const searcher = createSlugSearcher(
      [{ tag: 'google-vertex' }, { tag: 'google-vertex/global' }, { tag: 'google-vertex/europe' }],
      {
        getFields: (record) => [{ name: 'tag', value: record.tag }],
      },
    )

    expect(searcher.search('google-vertex/').map((result) => result.record.tag)).toEqual([
      'google-vertex/global',
      'google-vertex/europe',
    ])
  })

  it('uses compareItems to break ties within the same score bucket', () => {
    const searcher = createSlugSearcher(
      [
        { slug: 'openai/gpt-5.4', addedAt: 200 },
        { slug: 'openai/gpt-3.5-turbo', addedAt: 100 },
        { slug: 'openai/gpt-4', addedAt: 150 },
      ],
      {
        getFields: (record) => [{ name: 'slug', value: record.slug }],
        compareItems: (left, right) => right.addedAt - left.addedAt,
      },
    )

    expect(searcher.search('openai').map((result) => result.record.slug)).toEqual([
      'openai/gpt-5.4',
      'openai/gpt-4',
      'openai/gpt-3.5-turbo',
    ])
  })

  it('returns score buckets that distinguish exact from prefix matches', () => {
    const searcher = createSlugSearcher(
      [{ slug: 'openai/gpt-4.1' }, { slug: 'openai/gpt-4.1-mini' }],
      {
        getFields: (record) => [{ name: 'slug', value: record.slug }],
      },
    )

    const results = searcher.search('openai gpt-4.1')

    expect(
      results.map((result) => ({
        slug: result.record.slug,
        score: result.score,
      })),
    ).toEqual([
      { slug: 'openai/gpt-4.1', score: 2000 },
      { slug: 'openai/gpt-4.1-mini', score: 1001 },
    ])
  })
})

describe('createSlugSearcher endpoint integration', () => {
  it('can use model.or_added_at as an endpoint tie-breaker', () => {
    const searcher = createSlugSearcher(
      [
        {
          model: {
            slug: 'openai/gpt-5.4',
            version_slug: 'openai/gpt-5.4',
            or_added_at: 300,
          },
          provider: {
            tag_slug: 'openai',
          },
        },
        {
          model: {
            slug: 'openai/gpt-4',
            version_slug: 'openai/gpt-4',
            or_added_at: 200,
          },
          provider: {
            tag_slug: 'openai',
          },
        },
        {
          model: {
            slug: 'openai/gpt-3.5-turbo',
            version_slug: 'openai/gpt-3.5-turbo',
            or_added_at: 100,
          },
          provider: {
            tag_slug: 'openai',
          },
        },
      ],
      {
        getFields: (endpoint) => [
          { name: 'model.slug', value: endpoint.model.slug },
          { name: 'model.version_slug', value: endpoint.model.version_slug },
          { name: 'provider.tag_slug', value: endpoint.provider.tag_slug },
        ],
        compareItems: (left, right) =>
          right.model.or_added_at - left.model.or_added_at ||
          left.model.slug.localeCompare(right.model.slug) ||
          left.provider.tag_slug.localeCompare(right.provider.tag_slug),
      },
    )

    expect(searcher.search('openai').map((result) => result.record.model.slug)).toEqual([
      'openai/gpt-5.4',
      'openai/gpt-4',
      'openai/gpt-3.5-turbo',
    ])
  })
})
