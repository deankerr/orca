import { ConvexError } from 'convex/values'

import { canonicalJson } from '../json'
import { selectPricing } from '../pricing'
import type { Endpoint, ExtractedScan, Model, Provider } from '../scan'
import { CatalogEndpoint, CatalogModel, CatalogProvider } from './entities'
import type { CurrentEndpointRow, CurrentModelRow, CurrentProviderRow } from './table'

/** Project endpoint rows using only their required model context. */
export function projectEndpoints(scan: ExtractedScan, models: Map<string, CurrentModelRow>) {
  const endpoints = new Map<string, CurrentEndpointRow>()

  for (const endpoint of scan.endpoints.values()) {
    const model = models.get(endpoint.model_id)

    if (model === undefined) {
      throw new ConvexError(`Endpoint ${endpoint.id} is missing model context`)
    }

    endpoints.set(
      endpoint.id,
      projectEndpoint({
        endpoint,
        model,
        scan_at: scan.scan_at,
      }),
    )
  }

  return endpoints
}

/** Project observed model facts at a scan time. */
export function projectModel(model: Model, scanAt: string): CurrentModelRow {
  const {
    id,
    variant,
    slug,
    permaslug,
    input_modalities,
    output_modalities,
    short_name,
    created_at,
    ...rest
  } = CatalogModel.parse(model)

  return {
    model_id: id,
    scan_at: scanAt,
    slug,
    permaslug,
    variant,
    display_name: short_name,
    or_created_at: created_at,
    input_modalities: input_modalities.toSorted(),
    output_modalities: output_modalities.toSorted(),
    metadata_json: canonicalJson(rest, { sortStringArrays: true }),
  }
}

/** Project observed provider facts at a scan time. */
export function projectProvider(provider: Provider, scanAt: string): CurrentProviderRow {
  const { provider_id, displayName, ...rest } = CatalogProvider.parse(provider)

  return {
    provider_id,
    scan_at: scanAt,
    display_name: displayName,
    metadata_json: canonicalJson(rest, { sortStringArrays: true }),
  }
}

/** Project one endpoint from its raw value and the related rows already resolved for this context. */
export function projectEndpoint(args: {
  endpoint: Endpoint
  model: CurrentModelRow
  scan_at: string
  unlisted_at?: string
}): CurrentEndpointRow {
  const {
    id: endpointId,
    variant,
    provider_tag: providerTag,
    model_id,
    provider_id,
    stats: _stats,
    statsByTier: _statsByTier,
    provider_display_name: providerDisplayName,
    pricing,
    ...metadata
  } = CatalogEndpoint.parse(args.endpoint)

  const row: CurrentEndpointRow = {
    endpoint_id: endpointId,
    model_id,
    provider_id,
    provider_tag: providerTag,
    variant,
    scan_at: args.scan_at,
    model_display_name: args.model.display_name,
    model_permaslug: args.model.permaslug,
    model_or_created_at: args.model.or_created_at,
    input_modalities: args.model.input_modalities,
    output_modalities: args.model.output_modalities,
    provider_display_name: providerDisplayName,
    pricing: selectPricing(pricing),
    metadata_json: canonicalJson(metadata, { sortStringArrays: true }),
  }

  if (args.unlisted_at !== undefined) {
    row.unlisted_at = args.unlisted_at
  }

  return row
}
