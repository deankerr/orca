import * as R from 'remeda'
import { z } from 'zod'

import type { ScanArtifactEntry } from '../scan/schema'
import { IdentifiedModel } from '../scan/schema'
import type { EndpointRow, MetadataRecord, ModelRow, ProviderRow } from './entities.table'
import type { EndpointsPricingRow, StatsRow } from './series.table'

type MetadataValue = MetadataRecord[string]

const MODEL_METADATA_OMIT = new Set([
  'slug',
  'permaslug',
  'variant',
  'input_modalities',
  'output_modalities',
  'created_at',
  'short_name',
  'author_display_name',
  'endpoint',
])

const modelSourceSchema = z.looseObject({
  ...IdentifiedModel.shape,
  short_name: z.string(),
  author_display_name: z.string(),
  created_at: z.string(),
})

function projectModel(entry: ScanArtifactEntry): ModelRow {
  const model = modelSourceSchema.parse(entry.model)

  return {
    scan_at: entry.scan_at,
    model_id: entry.model_id,
    permaslug: model.permaslug,
    variant: entry.variant,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    or_created_at: model.created_at,
    display_name: model.short_name,
    author_display_name: model.author_display_name,
    metadata: flattenMetadata(model, MODEL_METADATA_OMIT),
  }
}

const PROVIDER_METADATA_OMIT = new Set(['slug', 'displayName', 'dataPolicy'])

const providerInfoSchema = z.looseObject({
  slug: z.string(),
  displayName: z.string(),
})

function projectProvider(
  scan_at: string,
  providerInfo: z.infer<typeof providerInfoSchema>,
): ProviderRow {
  return {
    scan_at,
    provider_id: providerInfo.slug,
    display_name: providerInfo.displayName,
    metadata: flattenMetadata(providerInfo, PROVIDER_METADATA_OMIT),
  }
}

const ENDPOINT_METADATA_OMIT = new Set([
  'id',
  'variant',
  'provider_slug',
  'provider_info',
  'model',
  'pricing',
  'display_pricing',
  'pricing_json',
  'pricing_version_id',
  'stats',
  'statsByTier',
])

const statsSourceSchema = z.object({ endpoint_id: z.string() }).catchall(z.number())

const endpointSourceSchema = z.looseObject({
  id: z.string(),
  variant: z.string(),
  provider_slug: z.string(),
  provider_info: providerInfoSchema,
  pricing: z.unknown().optional(),
  stats: statsSourceSchema.optional(),
  statsByTier: z.record(z.string(), statsSourceSchema.optional()).optional(),
})

function projectEndpoint(
  scan_at: string,
  entry: ScanArtifactEntry,
  endpoint: z.infer<typeof endpointSourceSchema>,
  provider: ProviderRow,
): EndpointRow {
  return {
    scan_at,
    endpoint_id: endpoint.id,
    model_id: entry.model_id,
    variant: entry.variant,
    provider_tag: endpoint.provider_slug,
    provider_id: provider.provider_id,
    metadata: flattenMetadata(endpoint, ENDPOINT_METADATA_OMIT),
  }
}

function projectStats(
  endpoint_id: string,
  scan_at: string,
  endpoint: z.infer<typeof endpointSourceSchema>,
): StatsRow[] {
  const samples = Object.entries(endpoint.statsByTier ?? {})
  if (endpoint.statsByTier === undefined && endpoint.stats !== undefined) {
    samples.push(['default', endpoint.stats])
  }

  return samples.flatMap(([tier, stats]) => {
    if (stats === undefined) {
      return []
    }

    const { endpoint_id: _, ...sample } = stats
    return [{ endpoint_id, scan_at, tier, sample }]
  })
}

export const endpointPricingSchema = z.object({
  prompt: z.string(),
  completion: z.string(),
  discount: z.number(),
  image: z.string().optional(),
  image_output: z.string().optional(),
  input_cache_read: z.string().optional(),
  input_cache_write: z.string().optional(),
  input_cache_write_1h: z.string().optional(),
  audio: z.string().optional(),
  input_audio_cache: z.string().optional(),
  web_search: z.string().optional(),
  overrides: z.array(z.record(z.string(), z.unknown())).optional(),
})

function projectPricing(
  endpoint_id: string,
  scan_at: string,
  pricing: unknown,
): EndpointsPricingRow | null {
  const parsed = endpointPricingSchema.safeParse(pricing)
  if (!parsed.success) {
    return null
  }

  const { overrides, ...meters } = parsed.data
  const projectedOverrides = overrides
    ?.map((override) => flattenMetadata(override, new Set()))
    .filter((override) => Object.keys(override).length > 0)

  return {
    endpoint_id,
    scan_at,
    ...meters,
    ...(projectedOverrides !== undefined && projectedOverrides.length > 0
      ? { overrides: projectedOverrides }
      : {}),
  }
}

export type CatalogSnapshot = {
  scan_at: string
  models: ModelRow[]
  endpoints: EndpointRow[]
  providers: ProviderRow[]
  prices: EndpointsPricingRow[]
  stats: StatsRow[]
}

export type CatalogWrite =
  | { table: 'models'; row: ModelRow }
  | { table: 'endpoints'; row: EndpointRow }
  | { table: 'providers'; row: ProviderRow }
  | { table: 'endpointsPricing'; row: EndpointsPricingRow }
  | { table: 'stats'; row: StatsRow }

export function projectScan(entries: ScanArtifactEntry[]): CatalogSnapshot {
  if (entries.length === 0) {
    return { scan_at: '', models: [], endpoints: [], providers: [], prices: [], stats: [] }
  }

  const [{ scan_at }] = entries
  const models: ModelRow[] = []
  const endpoints: EndpointRow[] = []
  const prices: EndpointsPricingRow[] = []
  const stats: StatsRow[] = []
  const providers = new Map<string, ProviderRow>()

  for (const entry of entries) {
    models.push(projectModel(entry))

    if (entry.endpoints === null) {
      continue
    }

    for (const rawEndpoint of entry.endpoints) {
      const endpoint = endpointSourceSchema.parse(rawEndpoint)
      const provider = projectProvider(scan_at, endpoint.provider_info)
      providers.set(provider.provider_id, provider)

      endpoints.push(projectEndpoint(scan_at, entry, endpoint, provider))

      const price = projectPricing(endpoint.id, scan_at, endpoint.pricing)
      if (price !== null) {
        prices.push(price)
      }

      stats.push(...projectStats(endpoint.id, scan_at, endpoint))
    }
  }

  return {
    scan_at,
    models,
    endpoints,
    providers: [...providers.values()],
    prices,
    stats,
  }
}

export function catalogWrites(
  previous: CatalogSnapshot | null,
  next: CatalogSnapshot,
): CatalogWrite[] {
  const writes: CatalogWrite[] = []

  const prevModels = indexBy(previous?.models, (row) => row.model_id)
  for (const row of next.models) {
    if (!sameRecord(prevModels.get(row.model_id), row)) {
      writes.push({ table: 'models', row })
    }
  }

  const prevProviders = indexBy(previous?.providers, (row) => row.provider_id)
  for (const row of next.providers) {
    if (!sameRecord(prevProviders.get(row.provider_id), row)) {
      writes.push({ table: 'providers', row })
    }
  }

  const prevEndpoints = indexBy(previous?.endpoints, (row) => row.endpoint_id)
  const nextEndpointIds = new Set(next.endpoints.map((row) => row.endpoint_id))

  for (const row of next.endpoints) {
    const prev = prevEndpoints.get(row.endpoint_id)
    if (prev?.unlisted_at !== undefined || !sameRecord(prev, row)) {
      writes.push({ table: 'endpoints', row })
    }
  }

  for (const prev of prevEndpoints.values()) {
    if (nextEndpointIds.has(prev.endpoint_id) || prev.unlisted_at !== undefined) {
      continue
    }

    writes.push({
      table: 'endpoints',
      row: { ...prev, scan_at: next.scan_at, unlisted_at: next.scan_at },
    })
  }

  const prevPrices = indexBy(previous?.prices, (row) => row.endpoint_id)
  for (const row of next.prices) {
    if (!sameRecord(prevPrices.get(row.endpoint_id), row)) {
      writes.push({ table: 'endpointsPricing', row })
    }
  }

  for (const row of next.stats) {
    writes.push({ table: 'stats', row })
  }

  return writes
}

export function flattenMetadata(
  value: unknown,
  omitKeys: ReadonlySet<string>,
  prefix = '',
): MetadataRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const metadata: MetadataRecord = {}

  for (const [key, nested] of Object.entries(value)) {
    if (prefix === '' && omitKeys.has(key)) {
      continue
    }

    const path = prefix === '' ? key : `${prefix}.${key}`
    if (!isMetadataKey(path)) {
      continue
    }

    if (isMetadataValue(nested)) {
      metadata[path] = Array.isArray(nested) ? nested.toSorted() : nested
      continue
    }

    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(metadata, flattenMetadata(nested, omitKeys, path))
    }
  }

  return metadata
}

function isMetadataValue(value: unknown): value is MetadataValue {
  if (value === null) {
    return true
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return true
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isMetadataKey(key: string) {
  return key.length > 0 && !key.startsWith('$') && !key.startsWith('_')
}

function sameRecord<T extends { scan_at: string }>(left: T | undefined, right: T) {
  if (left === undefined) {
    return false
  }
  return R.isDeepEqual(R.omit(left, ['scan_at']), R.omit(right, ['scan_at']))
}

function indexBy<T>(rows: T[] | undefined, key: (row: T) => string) {
  return new Map((rows ?? []).map((row) => [key(row), row]))
}
