import { z } from 'zod'

import { mepsMetadata } from './metadata'
import { Pricing } from './transforms/pricing'
import { endpointStats } from './transforms/stats'

export const catalogModel = z.object({
  model_id: z.string(),
  variant: z.string(),
  slug: z.string(),
  permaslug: z.string(),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  or_created_at: z.string(),
  display_name: z.string(),
  author_display_name: z.string(),
  metadata: mepsMetadata,
})

export const catalogEndpoint = z.object({
  endpoint_id: z.string(),
  model_id: z.string(),
  variant: z.string(),
  provider_tag: z.string(),
  provider_id: z.string(),
  metadata: mepsMetadata,
  pricing: Pricing.nullable(),
  stats: endpointStats.nullable(),
})

export const catalogProvider = z.object({
  provider_id: z.string(),
  display_name: z.string(),
  metadata: mepsMetadata,
})

export const catalogFile = z.object({
  models: z.record(z.string(), catalogModel),
  endpoints: z.record(z.string(), catalogEndpoint),
  providers: z.record(z.string(), catalogProvider),
})

export type CatalogFile = z.output<typeof catalogFile>
export type CatalogModel = z.output<typeof catalogModel>
export type CatalogEndpoint = z.output<typeof catalogEndpoint>
export type CatalogProvider = z.output<typeof catalogProvider>

export type Catalog = {
  models: Map<string, CatalogModel>
  endpoints: Map<string, CatalogEndpoint>
  providers: Map<string, CatalogProvider>
}

export function emptyCatalog(): Catalog {
  return {
    models: new Map(),
    endpoints: new Map(),
    providers: new Map(),
  }
}

export function serializeCatalog(catalog: Catalog): CatalogFile {
  return catalogFile.parse({
    models: toSortedRecord(catalog.models),
    endpoints: toSortedRecord(catalog.endpoints),
    providers: toSortedRecord(catalog.providers),
  })
}

export function deserializeCatalog(file: CatalogFile): Catalog {
  return {
    models: toSortedMap(file.models),
    endpoints: toSortedMap(file.endpoints),
    providers: toSortedMap(file.providers),
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

function toSortedMap<T>(record: Record<string, T>): Map<string, T> {
  const map = new Map<string, T>()
  for (const key of Object.keys(record).toSorted()) {
    const value = record[key]
    if (value !== undefined) {
      map.set(key, value)
    }
  }
  return map
}
