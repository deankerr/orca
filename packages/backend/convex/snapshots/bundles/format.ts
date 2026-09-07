import { ConvexError } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import type { CrawlArchiveBundle } from '../crawl/main'

/*
  - removes known duplicate embedded records, reducing bundle size by half
  - uses true `model` data source, so variant name fixes at not required
  - excludes non-model-endpoints records and metadata
  - invalid/defective bundles are not allowed
*/

const bundle_format = 'model-endpoints-v1' as const

export const ModelEndpointsV1 = z.object({
  crawl_at: z.iso.datetime(),
  crawl_id: z.string(),
  bundle_format: z.literal(bundle_format),
  data: z
    .object({
      model_id: z.string(),
      model: z.looseObject({
        slug: z.string(),
        permaslug: z.string(),
      }),
      endpoints: z
        .looseObject({
          id: z.uuid(),
          model_variant_slug: z.string(),
        })
        .array()
        .nullable(),
      variant: z.string(),
    })
    .array(),
})

export type ModelEndpointsV1 = z.infer<typeof ModelEndpointsV1>

export function formatBundle(bundle: CrawlArchiveBundle): ModelEndpointsV1 {
  const { crawl_id } = bundle
  const crawl_at = new Date(Number(crawl_id)).toISOString()

  const data = []

  for (const entry of bundle.data.models) {
    // we never want ~ alias model data
    if (entry.model.slug.startsWith('~')) {
      continue
    }

    const { endpoint, ...model } = entry.model

    // in this case, crawl does not query for bundles
    if (endpoint === null) {
      data.push({ model_id: model.slug, model, endpoints: null, variant: 'standard' })
      continue
    }

    const { endpoints } = entry

    if (!Array.isArray(endpoints)) {
      throw new ConvexError({
        message: 'This bundle contains a FetchError and should be discarded.',
        crawl_id,
        model_slug: model.slug,
      })
    }

    if (endpoints.length < 1) {
      throw new ConvexError({
        message: `This bundle is missing endpoints for a model and should be discarded.`,
        crawl_id,
        model_slug: model.slug,
      })
    }

    data.push({
      model_id: endpoint.model_variant_slug as string,
      model,
      endpoints: endpoints.map(R.omit(['model'])),
      variant: endpoint.variant,
    })
  }

  if (data.length < 1) {
    throw new ConvexError({
      message: 'This bundle contains no model records and should be discarded.',
      crawl_id,
    })
  }

  return ModelEndpointsV1.parse({ crawl_at, crawl_id, bundle_format, data })
}
