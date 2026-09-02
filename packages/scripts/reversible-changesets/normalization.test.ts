import { expect, test } from 'bun:test'

import { normalizeBundleToObjectMaps } from './normalization.ts'

const ENDPOINT_ID = '00000000-0000-4000-8000-000000000001'

test('normalizes only model and endpoint collections to identity-keyed maps', () => {
  const normalized = normalizeBundleToObjectMaps({
    bundle_format: 'model-endpoints-v1',
    crawl_at: '2026-08-16T00:30:09.313Z',
    crawl_id: '1786840209313',
    data: [
      {
        endpoints: [
          {
            id: ENDPOINT_ID,
            model_variant_slug: 'model/a',
            values: ['b', 'a'],
          },
        ],
        model: { permaslug: 'model/a', slug: 'model/a' },
        model_id: 'model/a',
        variant: 'standard',
      },
      {
        endpoints: null,
        model: { permaslug: 'model/b', slug: 'model/b' },
        model_id: 'model/b',
        variant: 'standard',
      },
    ],
  })

  expect(Object.keys(normalized.data)).toEqual(['model/a', 'model/b'])
  expect(Object.keys(normalized.data['model/a']?.endpoints ?? {})).toEqual([ENDPOINT_ID])
  expect(normalized.data['model/a']?.endpoints?.[ENDPOINT_ID]?.values).toEqual(['b', 'a'])
  expect(normalized.data['model/b']?.endpoints).toBeNull()
})

test('rejects duplicate identities', () => {
  expect(() =>
    normalizeBundleToObjectMaps({
      bundle_format: 'model-endpoints-v1',
      crawl_at: '2026-08-16T00:30:09.313Z',
      crawl_id: '1786840209313',
      data: [
        {
          endpoints: [],
          model: { permaslug: 'model/a', slug: 'model/a' },
          model_id: 'model/a',
          variant: 'standard',
        },
        {
          endpoints: null,
          model: { permaslug: 'model/a', slug: 'model/a' },
          model_id: 'model/a',
          variant: 'standard',
        },
      ],
    }),
  ).toThrow('Duplicate model_id')
})
