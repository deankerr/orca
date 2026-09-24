import { ConvexError } from 'convex/values'

import type { CurrentEndpointRow, CurrentModelRow, CurrentProviderRow } from '../catalog/table'
import { canonicalJson } from '../json'
import type { ExtractedScan } from '../scan'
import { EndpointValue, SourceProvider, StoredModel } from '../scan/entities'
import { decodeMetadata } from './metadata'
import { selectPricing } from './pricing'

/** Product projection of one complete scoped scan. */
export type ProjectedScan = {
  scan_at: string
  models: Map<string, CurrentModelRow>
  providers: Map<string, CurrentProviderRow>
  endpoints: Map<string, CurrentEndpointRow>
}

/**
 * Project a full scan with scan-local model and provider context.
 * A later historical read carries values forward; this path is for two captured scans.
 */
export function projectScan(scan: ExtractedScan): ProjectedScan {
  const models = new Map<string, CurrentModelRow>()
  const providers = new Map<string, CurrentProviderRow>()

  for (const entity of scan.models.values()) {
    models.set(entity.entity_id, projectModel(entity.raw, scan.scan_at))
  }

  for (const entity of scan.providers.values()) {
    providers.set(entity.entity_id, projectProvider(entity.raw, scan.scan_at))
  }

  const endpoints = new Map<string, CurrentEndpointRow>()

  for (const endpoint of scan.endpoints.values()) {
    const model = models.get(endpoint.model_id)
    const provider = providers.get(endpoint.provider_id)

    if (model === undefined || provider === undefined) {
      throw new ConvexError(`Endpoint ${endpoint.entity_id} is missing model or provider context`)
    }

    endpoints.set(
      endpoint.entity_id,
      projectEndpoint({
        raw: endpoint.raw,
        model,
        provider,
        model_id: endpoint.model_id,
        provider_id: endpoint.provider_id,
        scan_at: scan.scan_at,
      }),
    )
  }

  return { scan_at: scan.scan_at, models, providers, endpoints }
}

/** Project a retained model payload at a selected context time. */
export function projectModel(raw: unknown, scanAt: string): CurrentModelRow {
  const stored = StoredModel.parse(raw)
  const { slug, permaslug, input_modalities, output_modalities, short_name, created_at, ...rest } =
    stored.model

  return {
    model_id: stored.model_id,
    scan_at: scanAt,
    slug,
    permaslug,
    variant: stored.variant,
    display_name: short_name,
    or_created_at: created_at,
    input_modalities: input_modalities.toSorted(),
    output_modalities: output_modalities.toSorted(),
    metadata_json: canonicalJson(rest),
  }
}

/** Project a retained provider payload at a selected context time. */
export function projectProvider(raw: unknown, scanAt: string): CurrentProviderRow {
  const source = SourceProvider.parse(raw)
  const { slug, displayName, ...rest } = source

  return {
    provider_id: slug,
    scan_at: scanAt,
    display_name: displayName,
    metadata_json: canonicalJson(rest),
  }
}

/** Project one endpoint from its raw value and the related rows already resolved for this context. */
export function projectEndpoint(args: {
  raw: unknown
  model: CurrentModelRow
  provider: CurrentProviderRow
  model_id: string
  provider_id: string
  scan_at: string
  unlisted_at?: string
}): CurrentEndpointRow {
  const {
    id: endpointId,
    variant,
    provider_tag: providerTag,
    pricing,
    ...metadata
  } = EndpointValue.parse(args.raw)

  if (args.provider.provider_id !== args.provider_id) {
    throw new ConvexError(`Endpoint ${endpointId} provider does not match its record`)
  }

  if (args.model.model_id !== args.model_id) {
    throw new ConvexError(`Endpoint ${endpointId} model does not match its record`)
  }

  const row: CurrentEndpointRow = {
    endpoint_id: endpointId,
    model_id: args.model_id,
    provider_id: args.provider_id,
    provider_tag: providerTag,
    variant,
    scan_at: args.scan_at,
    model_display_name: args.model.display_name,
    model_permaslug: args.model.permaslug,
    model_or_created_at: args.model.or_created_at,
    input_modalities: args.model.input_modalities,
    output_modalities: args.model.output_modalities,
    provider_display_name: args.provider.display_name,
    pricing: selectPricing(pricing),
    metadata_json: canonicalJson({
      endpoint: metadata,
      model: decodeMetadata(args.model.metadata_json),
      provider: decodeMetadata(args.provider.metadata_json),
    }),
  }

  if (args.unlisted_at !== undefined) {
    row.unlisted_at = args.unlisted_at
  }

  return row
}
