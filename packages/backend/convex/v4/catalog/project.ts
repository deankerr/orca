import { ConvexError } from 'convex/values'

import { selectEndpoint, selectModel, selectProvider } from '../facts'
import { canonicalJson } from '../json'
import { encodePricing } from '../pricing'
import type { Endpoint, Model, Provider } from '../scan/entities'
import type { Scan } from '../scan/extract'
import type { CurrentEndpointRow } from './endpoints/table'
import type { CurrentModelRow } from './models/table'
import type { CurrentProviderRow } from './providers/table'

/** Project endpoint rows using only their required model context. */
export function projectEndpoints(scan: Scan, models: Map<string, CurrentModelRow>) {
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
  const { metadata, ...facts } = selectModel(model)
  return {
    ...facts,
    scan_at: scanAt,
    metadata_json: canonicalJson(metadata, { sortStringArrays: true }),
  }
}

/** Project observed provider facts at a scan time. */
export function projectProvider(provider: Provider, scanAt: string): CurrentProviderRow {
  const { metadata, ...facts } = selectProvider(provider)
  return {
    ...facts,
    scan_at: scanAt,
    metadata_json: canonicalJson(metadata, { sortStringArrays: true }),
  }
}

/** Project one endpoint from its raw value and the related rows already resolved for this context. */
export function projectEndpoint(args: {
  endpoint: Endpoint
  model: CurrentModelRow
  scan_at: string
  unlisted_at?: string
}): CurrentEndpointRow {
  const { metadata, pricing, ...facts } = selectEndpoint(args.endpoint)

  const row: CurrentEndpointRow = {
    ...facts,
    scan_at: args.scan_at,
    model_display_name: args.model.display_name,
    model_permaslug: args.model.permaslug,
    model_or_created_at: args.model.or_created_at,
    input_modalities: args.model.input_modalities,
    output_modalities: args.model.output_modalities,
    pricing: encodePricing(pricing),
    metadata_json: canonicalJson(metadata, { sortStringArrays: true }),
  }

  if (args.unlisted_at !== undefined) {
    row.unlisted_at = args.unlisted_at
  }

  return row
}
