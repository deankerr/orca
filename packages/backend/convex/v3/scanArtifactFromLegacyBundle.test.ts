/// <reference types="bun" />

import { expect, spyOn, test } from 'bun:test'

import type { CrawlArchiveBundle } from '../snapshots/crawl/main'
import { scanArtifactFromLegacyBundle } from './scanArtifactFromLegacyBundle'

function bundle(
  endpoints: CrawlArchiveBundle['data']['models'][number]['endpoints'],
  catalogEndpoint?: NonNullable<CrawlArchiveBundle['data']['models'][number]['model']['endpoint']>,
): CrawlArchiveBundle {
  return {
    crawl_id: '1756717200000',
    args: {},
    data: {
      models: [
        {
          model: {
            slug: 'author/model',
            permaslug: 'author/model',
            author: 'author',
            input_modalities: ['text'],
            output_modalities: ['text'],
            endpoint: catalogEndpoint ?? {
              model_variant_slug: 'author/model',
              variant: 'standard',
            },
          },
          endpoints,
          uptimes: [],
          apps: [],
        },
      ],
      providers: [],
      modelAuthors: [],
    },
  } satisfies CrawlArchiveBundle
}

test('only known invalid legacy bundles are recoverable', () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {})

  expect(scanArtifactFromLegacyBundle(bundle({ error: 'failed' }))).toBeNull()
  expect(scanArtifactFromLegacyBundle(bundle([]))).toBeNull()
  expect(
    scanArtifactFromLegacyBundle({ ...bundle([]), data: { ...bundle([]).data, models: [] } }),
  ).toBeNull()

  expect(warn.mock.calls.map((call) => call[1] as unknown)).toEqual([
    {
      crawl_id: '1756717200000',
      model_slug: 'author/model',
      reason: 'endpoint_fetch_error',
    },
    {
      crawl_id: '1756717200000',
      model_slug: 'author/model',
      reason: 'missing_model_endpoints',
    },
    { crawl_id: '1756717200000', reason: 'no_model_records' },
  ])

  const endpoint = { id: 'endpoint', model_variant_slug: 'author/model', variant: 'standard' }
  expect(() => scanArtifactFromLegacyBundle(bundle([endpoint], { variant: 'standard' }))).toThrow()
  expect(() => scanArtifactFromLegacyBundle(bundle([{ id: 'endpoint' }]))).toThrow()

  warn.mockRestore()
})
