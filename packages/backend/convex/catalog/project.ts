import { ConvexError } from 'convex/values'

import type { ScannedEndpoint, ScannedModel, ScannedProvider, Scan } from '#scan/model'

import { encodePricing, normalizeEndpoint, normalizeModel, normalizeProvider } from '../entities'
import type { CurrentEndpointRow } from './endpoints/table'
import type { CurrentModelRow } from './models/table'
import type { CurrentProviderRow } from './providers/table'

/** Project endpoint rows using only their required model context. */
export function projectEndpoints(scan: Scan, models: Map<string, ReturnType<typeof projectModel>>) {
  const endpoints = new Map<string, ReturnType<typeof projectEndpoint>>()

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
export function projectModel(model: ScannedModel, scanAt: string) {
  return { ...normalizeModel(model), scan_at: scanAt }
}

/** Project observed provider facts at a scan time. */
export function projectProvider(provider: ScannedProvider, scanAt: string) {
  return { ...normalizeProvider(provider), scan_at: scanAt }
}

/** Project one endpoint from its raw value and the related rows already resolved for this context. */
export function projectEndpoint(args: {
  endpoint: ScannedEndpoint
  model: ReturnType<typeof projectModel>
  scan_at: string
}) {
  const endpoint = normalizeEndpoint(args.endpoint)

  return {
    ...endpoint,
    scan_at: args.scan_at,
    model_display_name: args.model.display_name,
    model_permaslug: args.model.permaslug,
    model_or_created_at: args.model.or_created_at,
    input_modalities: args.model.input_modalities,
    output_modalities: args.model.output_modalities,
  }
}

/** Encode open JSON fields after comparing normalized facts. */
export function encodeModel({
  metadata,
  ...facts
}: ReturnType<typeof projectModel>): Omit<CurrentModelRow, 'first_scan_at'> {
  return { ...facts, metadata_json: JSON.stringify(metadata) }
}

export function encodeProvider({
  metadata,
  ...facts
}: ReturnType<typeof projectProvider>): Omit<CurrentProviderRow, 'first_scan_at'> {
  return { ...facts, metadata_json: JSON.stringify(metadata) }
}

export function encodeEndpoint({
  metadata,
  pricing,
  ...facts
}: ReturnType<typeof projectEndpoint> & { unlisted_at?: string }): Omit<
  CurrentEndpointRow,
  'first_scan_at'
> {
  return { ...facts, pricing: encodePricing(pricing), metadata_json: JSON.stringify(metadata) }
}
