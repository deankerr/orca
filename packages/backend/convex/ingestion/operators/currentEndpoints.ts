import * as R from 'remeda'

import { encodePricing } from '../../catalog/pricing'
import type { CurrentEndpointRow } from '../../catalog/tables/current'
import { endpointEntity } from '../lenses'
import { deriveCurrent } from './current'
import type { CurrentScope } from './current'
import type { Source } from './source'

const omittedMetadataKeys = [
  'adapter_name',
  'allowed_passthrough_parameters',
  'can_abort',
  'capacity_tpm',
  'created_at',
  'declared_region',
  'deprecation_date',
  'display_pricing',
  'excluded_parameters',
  'is_byok',
  'is_byok_only',
  'is_free',
  'is_hidden',
  'is_hipaa_eligible',
  'is_pricing_unresolved',
  'is_private',
  'model_variant_permaslug',
  'model_variant_slug',
  'name',
  'pricing_json',
  'pricing_version_id',
  'provider_model_id',
  'provider_name',
  'provider_region',
  'server_tool_costs_discount_exempt',
  'supported_image_parameters',
  'supported_video_parameters',
  'supports_multipart',
  'supports_tool_parameters',
] as const

export function derive(source: Source, scope: CurrentScope): CurrentEndpointRow[] {
  return deriveCurrent(
    source,
    scope,
    (scan) => scan.endpoints,
    (endpoint, version) => {
      const { metadata, pricing, ...fields } = endpointEntity(endpoint)

      return {
        ...fields,
        ...version,
        pricing: encodePricing(pricing),
        metadata_json: JSON.stringify(R.omit(metadata, omittedMetadataKeys)),
      }
    },
  )
}
