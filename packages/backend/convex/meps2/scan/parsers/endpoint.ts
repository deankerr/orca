import * as R from 'remeda'
import { z } from 'zod'

import { flattenMetadata } from './shared'

// cut back to only the fields required for table columns; the rest is flattened into metadata
export const Endpoint = z
  .looseObject({
    id: z.string(), // UUID [endpoint_id]
    model_variant_slug: z.string(), // [model_id]
    variant: z.string(),

    // endpoint-specific tag, e.g. "deepinfra/fp8" or "azure/us" (NOT the provider entity id)
    provider_slug: z.string(), // [provider_tag]

    // * Provider Entity
    provider_info: z.looseObject({
      slug: z.string(), // [provider_id] — may itself be tagged, e.g. "deepinfra/turbo"
      displayName: z.string(), // [display_name]
    }),
  })
  .transform((raw) => {
    const { id, model_variant_slug, variant, provider_slug, provider_info, ...rest } = raw

    // skip fields fields destined for the dedicated pricing/stats tables later
    const metadata_source = R.omit(rest, [
      'pricing',
      'pricing_json',
      'pricing_version_id',
      'display_pricing',
      'tiers',
      'stats',
      'statsByTier',
    ])

    const { slug, displayName, ...provider_rest } = provider_info

    return {
      endpoint: {
        endpoint_id: id,
        model_id: model_variant_slug,
        variant,
        provider_tag: provider_slug,
        provider_id: slug,

        metadata: flattenMetadata(metadata_source),
      },
      provider: {
        provider_id: slug,
        display_name: displayName,

        metadata: flattenMetadata(provider_rest),
      },
    }
  })
