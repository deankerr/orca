import type { Infer } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import type { Pricing } from '../scan/scanArtifact'
import type { endpointsTable } from '../tables/endpoints'
import type { modelsTable } from '../tables/models'
import type { pricingTable } from '../tables/pricing'
import type { providersTable } from '../tables/providers'
import type { vMetadataRecord } from '../tables/shared'
import type { statsTable } from '../tables/stats'
import type { SourceEndpoint, SourceModel } from './explode'

type ModelRow = Infer<typeof modelsTable.validator>
type EndpointRow = Infer<typeof endpointsTable.validator>
type ProviderRow = Infer<typeof providersTable.validator>
type PricingRow = Infer<typeof pricingTable.validator>
type StatsRow = Infer<typeof statsTable.validator>
type Metadata = Infer<typeof vMetadataRecord>

const MODEL_OMIT = [
  'model_id',
  'variant',
  'permaslug',
  'input_modalities',
  'output_modalities',
  'created_at',
  'name',
  'author_display_name',
  'endpoint',
] as const

const ENDPOINT_OMIT = [
  'id',
  'model_id',
  'variant',
  'provider_slug',
  'provider_info',
  'pricing',
  'stats',
  'statsByTier',
  'model',
] as const

const PRICING_OPTIONAL_STRINGS = [
  'image',
  'image_output',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
  'audio',
  'input_audio_cache',
  'web_search',
  'internal_reasoning',
  'image_token',
  'audio_output',
] as const satisfies readonly (keyof Pricing)[]

const statsBlobSchema = z.looseObject({
  endpoint_id: z.string(),
})

const metadataValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.null(),
  z.string(),
  z.array(z.string()),
])
const metadataRecordSchema = z.record(z.string(), metadataValueSchema)
const nestedMetadataRecordSchema = z.record(
  z.string(),
  z.union([metadataValueSchema, z.array(metadataRecordSchema)]),
)

/** Flatten a source-shaped model into a view row. Nested values the bag cannot hold stay on the scan artifact. */
export function toModelRow(model: SourceModel, scan_at: string): ModelRow {
  return {
    scan_at,
    model_id: model.model_id,
    variant: model.variant,
    permaslug: model.permaslug,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    or_created_at: model.created_at,
    display_name: model.name,
    author_display_name: model.author_display_name,
    metadata: flattenMetadata(R.omit(model, MODEL_OMIT)),
  }
}

/** Flatten a source-shaped endpoint into a view row. Does not set `unlisted_at`. */
export function toEndpointRow(endpoint: SourceEndpoint, scan_at: string): EndpointRow {
  return {
    scan_at,
    endpoint_id: endpoint.id,
    model_id: endpoint.model_id,
    variant: endpoint.variant,
    provider_tag: endpoint.provider_slug,
    provider_id: endpoint.provider_info.slug,
    metadata: flattenMetadata(R.omit(endpoint, ENDPOINT_OMIT)),
  }
}

/** Provider view row from `endpoint.provider_info`. Last-write-wins is the caller's job. */
export function toProviderRow(endpoint: SourceEndpoint, scan_at: string): ProviderRow {
  const { slug, displayName, ...rest } = endpoint.provider_info

  return {
    scan_at,
    provider_id: slug,
    display_name: displayName,
    metadata: flattenMetadata(rest),
  }
}

export function hasPricing(
  endpoint: SourceEndpoint,
): endpoint is SourceEndpoint & { pricing: Pricing } {
  return endpoint.pricing !== null && endpoint.pricing !== undefined
}

/** Pricing sample, or null when the endpoint has no pricing object. */
export function toPricingRow(endpoint: SourceEndpoint, scan_at: string): PricingRow | null {
  if (!hasPricing(endpoint)) {
    return null
  }

  const { pricing } = endpoint
  const row: PricingRow = {
    endpoint_id: endpoint.id,
    scan_at,
    prompt: pricing.prompt,
    completion: pricing.completion,
    discount: pricing.discount,
  }

  for (const key of PRICING_OPTIONAL_STRINGS) {
    const value = pricing[key]
    if (typeof value === 'string') {
      row[key] = value
    }
  }

  const display_pricing = z.array(nestedMetadataRecordSchema).safeParse(pricing.display_pricing)
  if (display_pricing.success) {
    row.display_pricing = display_pricing.data
  }
  const overrides = z.array(metadataRecordSchema).safeParse(pricing.overrides)
  if (overrides.success) {
    row.overrides = overrides.data
  }

  return row
}

/**
 * Stats samples from `after` only. `statsByTier` is the source of truth; a
 * legacy `stats` object lands under tier `default`.
 */
export function collectStatsRows(
  endpoints: Map<string, SourceEndpoint>,
  scan_at: string,
): StatsRow[] {
  const rows: StatsRow[] = []

  for (const id of [...endpoints.keys()].toSorted()) {
    const endpoint = endpoints.get(id)
    if (endpoint === undefined) {
      continue
    }
    rows.push(...statsForEndpoint(endpoint, scan_at))
  }

  return rows
}

function statsForEndpoint(endpoint: SourceEndpoint, scan_at: string): StatsRow[] {
  const { id: endpoint_id } = endpoint
  const byTier: Record<string, Record<string, number>> = {}

  const byTierParsed = z.record(z.string(), z.unknown()).safeParse(endpoint.statsByTier)
  if (byTierParsed.success) {
    for (const [tier, value] of Object.entries(byTierParsed.data)) {
      const sample = numericSample(endpoint_id, value)
      if (sample !== null) {
        byTier[tier] = sample
      }
    }
  }

  if (Object.keys(byTier).length === 0) {
    const sample = numericSample(endpoint_id, endpoint.stats)
    if (sample !== null) {
      byTier.default = sample
    }
  }

  return Object.keys(byTier)
    .toSorted()
    .flatMap((tier) => {
      const sample = byTier[tier]
      return sample === undefined ? [] : [{ endpoint_id, scan_at, tier, sample }]
    })
}

function numericSample(endpointId: string, value: unknown): Record<string, number> | null {
  const parsed = statsBlobSchema.safeParse(value)
  if (!parsed.success || parsed.data.endpoint_id !== endpointId) {
    return null
  }

  const sample: Record<string, number> = {}
  for (const [key, field] of Object.entries(parsed.data)) {
    if (key === 'endpoint_id') {
      continue
    }
    if (typeof field === 'number' && Number.isFinite(field)) {
      sample[key] = field
    }
  }

  return Object.keys(sample).length === 0 ? null : sample
}

function flattenMetadata(source: Record<string, unknown>): Metadata {
  const metadata: Metadata = {}

  const walk = (key: string, value: unknown) => {
    if (isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        walk(`${key}.${nestedKey}`, nestedValue)
      }
      return
    }

    if (isMetadataValue(value)) {
      metadata[key] = value
    }
  }

  for (const [key, value] of Object.entries(source)) {
    walk(key, value)
  }

  return metadata
}

function isMetadataValue(value: unknown): value is Metadata[string] {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return true
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
