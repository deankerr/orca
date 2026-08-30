import * as R from 'remeda'
import { z } from 'zod'

import { flattenMetadata } from '../metadata'
import type { CatalogEndpoint, CatalogProvider } from '../v1'
import { Pricing } from './pricing'
import { collectEndpointStats } from './stats'

const statsObject = z.looseObject({ endpoint_id: z.string() })

export const Endpoint = z
  .looseObject({
    id: z.string(),
    model_variant_slug: z.string(),
    variant: z.string(),

    // endpoint-specific tag, e.g. "deepinfra/fp8" or "azure/us" (NOT the provider entity id)
    provider_slug: z.string(),

    provider_info: z.looseObject({
      slug: z.string(),
      displayName: z.string(),
    }),

    pricing: Pricing,
    stats: statsObject.optional(),
    statsByTier: z.record(z.string(), statsObject.optional()).optional(),
  })
  .transform((raw) => {
    const {
      id,
      model_variant_slug,
      variant,
      provider_slug,
      provider_info,
      pricing,
      stats,
      statsByTier,
      ...rest
    } = raw

    // pricing_json, pricing_version_id, top-level display_pricing, and tiers stay in rest → metadata
    const metadata_source = R.omit(rest, ['model'])
    const { slug, displayName, ...provider_rest } = provider_info

    const endpoint: CatalogEndpoint = {
      endpoint_id: id,
      model_id: model_variant_slug,
      variant,
      provider_tag: provider_slug,
      provider_id: slug,
      metadata: flattenMetadata(metadata_source),
      pricing,
      stats: collectEndpointStats(id, stats, statsByTier),
    }

    const provider: CatalogProvider = {
      provider_id: slug,
      display_name: displayName,
      metadata: flattenMetadata(provider_rest),
    }

    return { endpoint, provider }
  })
