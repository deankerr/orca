import { z } from 'zod'

import type { ScanArtifact } from '../../scan/artifact'
import type { ScanArtifactEntry } from '../../scan/schema'
import { IdentifiedModel } from '../../scan/schema'
import type { EndpointRow, MetadataRecord, ModelRow, ProviderRow } from '../entities.table'
import type { EndpointsPricingRow, StatsRow } from '../series.table'

type MetadataValue = MetadataRecord[string]
type ProjectedEndpointRow = Omit<EndpointRow, 'unlisted_at'>

const MODEL_METADATA_OMIT = new Set([
  'slug',
  'permaslug',
  'variant',
  'input_modalities',
  'output_modalities',
  'created_at',
  'short_name',
  'endpoint',
])

const ModelSource = z.looseObject({
  ...IdentifiedModel.shape,
  short_name: z.string(),
  created_at: z.string(),
})

function projectModel(scan_at: string, entry: ScanArtifactEntry): ModelRow {
  const model = ModelSource.parse(entry.model)

  return {
    scan_at,
    model_id: entry.model_id,
    permaslug: model.permaslug,
    variant: entry.variant,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    or_created_at: model.created_at,
    display_name: model.short_name,
    metadata: flattenMetadata(model, MODEL_METADATA_OMIT),
  }
}

const PROVIDER_METADATA_OMIT = new Set(['slug', 'displayName', 'dataPolicy'])

const ProviderInfo = z.looseObject({
  slug: z.string(),
  displayName: z.string(),
})

function projectProvider(scan_at: string, providerInfo: z.infer<typeof ProviderInfo>): ProviderRow {
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
  'status',
])

const EndpointPricing = z.object({
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

const StatsSource = z.object({ endpoint_id: z.string() }).catchall(z.number())

const EndpointSource = z.looseObject({
  id: z.string(),
  variant: z.string(),
  provider_slug: z.string(),
  provider_info: ProviderInfo,
  pricing: EndpointPricing,
  stats: StatsSource.optional(),
})

function projectEndpoint(
  scan_at: string,
  entry: ScanArtifactEntry,
  endpoint: z.infer<typeof EndpointSource>,
  provider: ProviderRow,
): ProjectedEndpointRow {
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
  endpoint: z.infer<typeof EndpointSource>,
): StatsRow[] {
  if (endpoint.stats === undefined) {
    return []
  }

  const { endpoint_id: _, ...sample } = endpoint.stats
  return [{ endpoint_id, scan_at, tier: 'default', sample }]
}

function projectPricing(
  endpoint_id: string,
  scan_at: string,
  pricing: z.infer<typeof EndpointPricing>,
): EndpointsPricingRow {
  const { overrides, ...meters } = pricing
  const projectedOverrides = overrides
    ?.map((override) => flattenMetadata(override, new Set()))
    .filter((override) => Object.keys(override).length > 0)

  return {
    endpoint_id,
    scan_at,
    overrides: projectedOverrides,
    ...meters,
  }
}

export type ScanProjection = {
  scan_at: string
  models: Map<string, ModelRow>
  endpoints: Map<string, ProjectedEndpointRow>
  providers: Map<string, ProviderRow>
  prices: Map<string, EndpointsPricingRow>
  stats: StatsRow[]
}

export const INITIAL_SCAN_PROJECTION: ScanProjection = {
  scan_at: '',
  models: new Map(),
  providers: new Map(),
  endpoints: new Map(),
  prices: new Map(),
  stats: [],
}

export function createScanProjection(artifact: ScanArtifact): ScanProjection {
  const { entries, scan_at } = artifact
  const models = new Map<string, ModelRow>()
  const endpoints = new Map<string, ProjectedEndpointRow>()
  const prices = new Map<string, EndpointsPricingRow>()
  const stats: StatsRow[] = []
  const providers = new Map<string, ProviderRow>()

  for (const entry of entries) {
    models.set(entry.model_id, projectModel(scan_at, entry))

    if (entry.endpoints === null) {
      continue
    }

    for (const rawEndpoint of entry.endpoints) {
      const endpoint = EndpointSource.parse(rawEndpoint)
      const provider = projectProvider(scan_at, endpoint.provider_info)
      providers.set(provider.provider_id, provider)

      endpoints.set(endpoint.id, projectEndpoint(scan_at, entry, endpoint, provider))
      prices.set(endpoint.id, projectPricing(endpoint.id, scan_at, endpoint.pricing))

      stats.push(...projectStats(endpoint.id, scan_at, endpoint))
    }
  }

  return {
    scan_at,
    models,
    endpoints,
    providers,
    prices,
    stats,
  }
}

function flattenMetadata(
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
