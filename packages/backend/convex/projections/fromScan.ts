import { z } from 'zod'

type Json = z.infer<ReturnType<typeof z.json>>
export type Metadata = Record<string, Json>

const Model = z
  .object({
    slug: z.string(),
    permaslug: z.string(),
    input_modalities: z.array(z.string()),
    output_modalities: z.array(z.string()),
    short_name: z.string(),
    created_at: z.string(),
  })
  .catchall(z.json())

const Provider = z.object({ slug: z.string(), displayName: z.string() }).catchall(z.json())
const Pricing = z
  .object({
    prompt: z.string(),
    completion: z.string(),
    discount: z.number(),
    overrides: z.array(z.record(z.string(), z.json())).optional(),
  })
  .catchall(z.json())
const Stats = z
  .object({ endpoint_id: z.string() })
  .catchall(z.union([z.number(), z.string(), z.null()]))
const Endpoint = z
  .object({
    id: z.string(),
    variant: z.string(),
    provider_slug: z.string(),
    provider_info: Provider,
    pricing: Pricing,
    stats: Stats.optional(),
  })
  .catchall(z.json())

// Inspect modalities before applying the product's required-field validation.
const Entry = z.object({
  model_id: z.string(),
  variant: z.string(),
  model: z
    .object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) })
    .catchall(z.json()),
  endpoints: z.array(z.unknown()).nullable(),
})

function projectModel(model_id: string, variant: string, source: z.infer<typeof Model>) {
  const { permaslug, input_modalities, output_modalities, short_name, created_at, ...metadata } =
    source
  return {
    model_id,
    variant,
    permaslug,
    input_modalities: input_modalities.toSorted(),
    output_modalities: output_modalities.toSorted(),
    display_name: short_name,
    or_created_at: created_at,
    metadata: flattenMetadata(metadata),
  }
}

function projectProvider(source: z.infer<typeof Provider>) {
  const { slug, displayName, ...metadata } = source
  return { provider_id: slug, display_name: displayName, metadata: flattenMetadata(metadata) }
}

function projectEndpoint(source: z.infer<typeof Endpoint>, model: ReturnType<typeof projectModel>) {
  const {
    id,
    provider_slug,
    provider_info,
    pricing,
    stats: _stats,
    statsByTier: _tiers,
    ...metadata
  } = source
  return {
    endpoint_id: id,
    model_id: model.model_id,
    variant: model.variant,
    provider_tag: provider_slug,
    provider_id: provider_info.slug,
    provider_display_name: provider_info.displayName,
    model_display_name: model.display_name,
    model_permaslug: model.permaslug,
    model_or_created_at: model.or_created_at,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    pricing,
    metadata: flattenMetadata(metadata),
  }
}

/** Validated, text-product records shared by views and change processing. */
export const ScanProjection = z
  .object({
    id: z.string(),
    scan_at: z.string(),
    entries: z.array(Entry),
  })
  .transform(({ id, scan_at, entries }) => {
    const catalog: {
      models: Record<string, ReturnType<typeof projectModel>>
      providers: Record<string, ReturnType<typeof projectProvider>>
      endpoints: Record<string, ReturnType<typeof projectEndpoint>>
    } = { models: {}, providers: {}, endpoints: {} }
    const stats: Record<
      string,
      { endpoint_id: string; tier: string; sample: Record<string, number | string | null> }
    > = {}

    for (const entry of entries) {
      if (
        !entry.model.input_modalities.includes('text') ||
        !entry.model.output_modalities.includes('text')
      ) {
        continue
      }
      const model = projectModel(entry.model_id, entry.variant, Model.parse(entry.model))
      catalog.models[model.model_id] = model
      for (const raw of entry.endpoints ?? []) {
        const endpoint = Endpoint.parse(raw)
        const provider = projectProvider(endpoint.provider_info)
        // Match production: last text-eligible occurrence selects the provider record.
        // Each endpoint keeps its own observed provider display name.
        catalog.providers[provider.provider_id] = provider
        catalog.endpoints[endpoint.id] = projectEndpoint(endpoint, model)
        if (endpoint.stats !== undefined) {
          const { endpoint_id: _, ...sample } = endpoint.stats
          stats[endpoint.id] = { endpoint_id: endpoint.id, tier: 'default', sample }
        }
      }
    }
    return { id, scan_at, catalog, stats }
  })

export type ScanProjection = z.infer<typeof ScanProjection>

/** Flatten object keys while retaining arrays, nulls, and empty objects. */
export function flattenMetadata(record: Metadata): Metadata {
  const result: Metadata = {}
  function visit(value: Json, key: string) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const children = Object.entries(value)
      if (children.length > 0) {
        for (const [child, nested] of children) {
          visit(nested, `${key}.${child}`)
        }
        return
      }
    }
    // Literal dotted-key collisions remain a projection policy gap.
    result[key] = value
  }
  for (const [key, value] of Object.entries(record)) {
    visit(value, key)
  }
  return result
}
