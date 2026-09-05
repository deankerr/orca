import { ConvexError } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import { createScanArtifact } from '../scan/artifact'
import type { ScanArtifact } from '../scan/artifact'
import { IdentifiedEndpoint } from '../scan/schema'
import type { CrawlArchiveBundle } from '../snapshots/crawl/main'

const CatalogEndpoint = z.object({
  model_variant_slug: z.string(),
  variant: z.string(),
})

export function scanArtifactFromBundle(bundle: CrawlArchiveBundle): ScanArtifact {
  const { crawl_id } = bundle
  const scan_at = new Date(Number(crawl_id)).toISOString()

  const entries = []

  for (const entry of bundle.data.models) {
    if (entry.model.slug.startsWith('~')) {
      continue
    }

    const { endpoint, ...model } = entry.model

    if (endpoint === null) {
      entries.push({
        model_id: model.slug,
        variant: 'standard',
        model,
        endpoints: null,
      })
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
        message: 'This bundle is missing endpoints for a model and should be discarded.',
        crawl_id,
        model_slug: model.slug,
      })
    }

    const catalogEndpoint = CatalogEndpoint.parse(endpoint)

    entries.push({
      model_id: catalogEndpoint.model_variant_slug,
      variant: catalogEndpoint.variant,
      model,
      endpoints: R.sortBy(IdentifiedEndpoint.array().parse(endpoints), R.prop('id')),
    })
  }

  if (entries.length < 1) {
    throw new ConvexError({
      message: 'This bundle contains no model records and should be discarded.',
      crawl_id,
    })
  }

  return createScanArtifact(R.sortBy(entries, R.prop('model_id')), scan_at)
}
