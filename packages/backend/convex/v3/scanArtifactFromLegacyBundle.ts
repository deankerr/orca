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

/** Convert a valid legacy archive bundle into a scan artifact. */
export function scanArtifactFromLegacyBundle(bundle: CrawlArchiveBundle): ScanArtifact | null {
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
      return invalidBundle({
        crawl_id,
        model_slug: model.slug,
        reason: 'endpoint_fetch_error',
      })
    }

    if (endpoints.length < 1) {
      return invalidBundle({
        crawl_id,
        model_slug: model.slug,
        reason: 'missing_model_endpoints',
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
    return invalidBundle({
      crawl_id,
      reason: 'no_model_records',
    })
  }

  return createScanArtifact(R.sortBy(entries, R.prop('model_id')), scan_at)
}

function invalidBundle(details: {
  crawl_id: string
  model_slug?: string
  reason: 'endpoint_fetch_error' | 'missing_model_endpoints' | 'no_model_records'
}) {
  console.warn('invalid legacy bundle', details)
  return null
}
