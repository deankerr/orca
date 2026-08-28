import { z } from 'zod'

import { Pricing } from './schemas/pricing'
import { endpointStats } from './schemas/stats'

const metadata = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string(), z.array(z.string())]),
)

// persisted catalog file: id-keyed records. working form is Map; JSON cannot store Map.
export const catalogModel = z.object({
  slug: z.string(),
  // overwritten at scan time: top endpoint UUID, or null when the model has no endpoints
  endpoint: z.string().nullable(),
  permaslug: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  or_created_at: z.string(),
  display_name: z.string(),
  author_display_name: z.string(),
  metadata,
})

export const catalogEndpoint = z.object({
  endpoint_id: z.string(),
  model_id: z.string(),
  variant: z.string(),
  provider_tag: z.string(),
  provider_id: z.string(),
  metadata,
  pricing: Pricing.nullable(),
  stats: endpointStats.nullable(),
})

export const catalogProvider = z.object({
  provider_id: z.string(),
  display_name: z.string(),
  metadata,
})

export const catalogItemFile = z.object({
  model_id: z.string(),
  variant: z.string(),
  model: catalogModel,
  endpoints: z.record(z.string(), catalogEndpoint).nullable(),
})

export const catalogFile = z.object({
  data: z.record(z.string(), catalogItemFile),
  providers: z.record(z.string(), catalogProvider),
})

export type CatalogFile = z.output<typeof catalogFile>
export type CatalogItemFile = z.output<typeof catalogItemFile>
export type CatalogModel = z.output<typeof catalogModel>
export type CatalogEndpoint = z.output<typeof catalogEndpoint>
export type CatalogProvider = z.output<typeof catalogProvider>

export type CatalogItem = Omit<CatalogItemFile, 'endpoints'> & {
  endpoints: Map<string, CatalogEndpoint> | null
}

export type Catalog = {
  data: Map<string, CatalogItem>
  providers: Map<string, CatalogProvider>
}

export function emptyCatalog(): Catalog {
  return { data: new Map(), providers: new Map() }
}

export function serializeCatalog(catalog: Catalog): CatalogFile {
  const data: CatalogFile['data'] = {}
  for (const model_id of [...catalog.data.keys()].toSorted()) {
    const item = catalog.data.get(model_id)
    if (item === undefined) {
      continue
    }
    data[model_id] = {
      model_id: item.model_id,
      variant: item.variant,
      model: item.model,
      endpoints: item.endpoints === null ? null : toSortedRecord(item.endpoints),
    }
  }

  return {
    data,
    providers: toSortedRecord(catalog.providers),
  }
}

export function deserializeCatalog(file: CatalogFile): Catalog {
  const data = new Map<string, CatalogItem>()
  for (const [model_id, item] of Object.entries(file.data)) {
    data.set(model_id, {
      model_id: item.model_id,
      variant: item.variant,
      model: item.model,
      endpoints: item.endpoints === null ? null : new Map(Object.entries(item.endpoints)),
    })
  }

  return {
    data,
    providers: new Map(Object.entries(file.providers)),
  }
}

function toSortedRecord<T>(map: Map<string, T>): Record<string, T> {
  const record: Record<string, T> = {}
  for (const key of [...map.keys()].toSorted()) {
    const value = map.get(key)
    if (value !== undefined) {
      record[key] = value
    }
  }
  return record
}
