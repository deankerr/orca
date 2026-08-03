import { describe, expect, test } from 'bun:test'

import { cleanBundle } from '../src/corpus/clean.ts'
import { deduplicateModels } from '../src/corpus/dedupe.ts'

const textModel = { output_modalities: ['text'], slug: 'author/model' }
const endpoint = { id: 'endpoint', model: textModel }

describe('clean corpus bundle', () => {
  test('keeps only text scopes and removes unrelated crawl sources', () => {
    const result = cleanBundle({
      args: { legacy: true },
      crawl_id: '1',
      data: {
        analytics: { large: true },
        models: [
          { apps: [1, 2], endpoints: [endpoint], model: textModel, uptimes: [1, 2] },
          {
            endpoints: [{ id: 'image-endpoint', model: { output_modalities: ['image'] } }],
            model: { output_modalities: ['image'], slug: 'image/model' },
          },
        ],
        providers: [{ id: 'unused' }],
      },
    })

    expect(result._tag).toBe('Accepted')
    if (result._tag === 'Accepted') {
      expect(result.bundle).toEqual({
        crawl_id: '1',
        data: { models: [{ endpoints: [endpoint], model: textModel }] },
      })
    }
  })

  test('ignores scope models and deduplicates endpoint model copies', () => {
    const otherEndpoint = {
      id: 'other-endpoint',
      model: { ...textModel, name: 'last endpoint copy wins' },
    }
    const result = cleanBundle({
      crawl_id: '1',
      data: {
        models: [
          {
            endpoints: [endpoint, otherEndpoint],
            model: { ...textModel, name: 'unused scope presentation' },
          },
          { endpoints: [], model: { output_modalities: ['text'], slug: 'scope-only' } },
        ],
      },
    })
    expect(result._tag).toBe('Accepted')
    if (result._tag === 'Accepted') {
      expect(deduplicateModels(result.bundle)).toEqual({
        crawlId: '1',
        endpoints: [
          { data: { id: 'endpoint' }, modelSlug: 'author/model' },
          { data: { id: 'other-endpoint' }, modelSlug: 'author/model' },
        ],
        models: [{ ...textModel, name: 'last endpoint copy wins' }],
      })
    }
  })

  test('drops obvious empty catalogs and failed text endpoint scopes', () => {
    expect(cleanBundle({ crawl_id: '1', data: { models: [] } })).toMatchObject({
      _tag: 'Dropped',
      reason: 'empty-catalog',
    })
    expect(
      cleanBundle({
        crawl_id: '2',
        data: { models: [{ endpoints: { status: 500 }, model: textModel }] },
      }),
    ).toMatchObject({ _tag: 'Dropped', reason: 'failed-text-endpoint-scope' })
  })
})
