import * as R from 'remeda'
import { z } from 'zod'

import { Pricing } from './pricing'
import { flattenMetadata } from './shared'
import { collectEndpointStats, statsByTierSource, statsSampleSource } from './stats'

// cut back to only the fields required for table columns; the rest is flattened into metadata.
// pricing and stats are structured catalog fields (not endpoint-row columns).
export const Endpoint = z
  .looseObject({
    id: z.string(), // UUID [endpoint_id]
    model_variant_slug: z.string(), // [model_id]
    variant: z.string(),

    // endpoint-specific tag, e.g. "deepinfra/fp8" or "azure/us" (NOT the provider entity id)
    provider_slug: z.string(), // [provider_tag]

    // * Provider Entity
    provider_info: z.looseObject({
      slug: z.string(), // [provider_id] — _MAY_ itself be tagged, e.g. "deepinfra/turbo"
      displayName: z.string(), // [display_name]
    }),

    pricing: Pricing,
    stats: statsSampleSource.optional(),
    statsByTier: statsByTierSource.optional(),
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

    return {
      endpoint: {
        endpoint_id: id,
        model_id: model_variant_slug,
        variant,
        provider_tag: provider_slug,
        provider_id: slug,

        metadata: flattenMetadata(metadata_source),
        pricing,
        stats: collectEndpointStats(id, stats, statsByTier),
      },
      provider: {
        provider_id: slug,
        display_name: displayName,

        metadata: flattenMetadata(provider_rest),
      },
    }
  })

export type EndpointRow = z.output<typeof Endpoint>['endpoint']
export type ProviderRow = z.output<typeof Endpoint>['provider']
