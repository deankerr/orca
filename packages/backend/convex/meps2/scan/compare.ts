import { diff } from 'json-diff-ts'
import type { IChange, Options as DiffOptions } from 'json-diff-ts'

import type { Catalog, CatalogEndpoint, CatalogItem, CatalogProvider } from './catalog'

// dirty-check the current view by comparing catalog files (already transformed).
// identity is the map key; last-write-wins on duplicates, no uniqueness check.

export type ProjectionLog = {
  id: string
  kind: 'create' | 'update' | 'delete'
  changeset?: IChange[]
}

export type ProjectionPlan<T> = {
  upserts: T[]
  deletes: string[]
  log: ProjectionLog[]
}

export type CatalogProjectionPlan = {
  models: ProjectionPlan<CatalogItem>
  endpoints: ProjectionPlan<CatalogEndpoint>
  providers: ProjectionPlan<CatalogProvider>
  pricing: CatalogEndpoint[]
}

const MODEL_DIFF_OPTIONS: DiffOptions = {
  keysToSkip: [
    // pointer into the endpoints collection
    'endpoint',
    // openrouter wall-clock, now nested in flattened metadata
    'metadata.updated_at',
  ],
  embeddedObjKeys: {
    input_modalities: '$value',
    output_modalities: '$value',
  },
  treatTypeChangeAsReplace: false,
}

const ENDPOINT_DIFF_OPTIONS: DiffOptions = {
  // stats are always appended and must not dirty the view.
  // pricing is compared: a pricing-only change still upserts the endpoint row (base).
  keysToSkip: ['stats'],
  embeddedObjKeys: {
    'metadata.supported_parameters': '$value',
    'metadata.excluded_parameters': '$value',
  },
  treatTypeChangeAsReplace: false,
}

export function planCatalogProjection(before: Catalog, after: Catalog): CatalogProjectionPlan {
  const afterEndpoints = indexEndpoints(after)
  const endpoints = planKeyed({
    before: indexEndpoints(before),
    after: afterEndpoints,
    comparable: (endpoint) => endpoint,
    options: ENDPOINT_DIFF_OPTIONS,
  })

  return {
    models: planKeyed({
      before: before.data,
      after: after.data,
      comparable: (item) => ({ variant: item.variant, ...item.model }),
      options: MODEL_DIFF_OPTIONS,
    }),
    endpoints,
    providers: planKeyed({
      before: before.providers,
      after: after.providers,
      comparable: (provider) => provider,
    }),
    pricing: collectPricingAppends(endpoints.log, afterEndpoints),
  }
}

function collectPricingAppends(log: ProjectionLog[], afterEndpoints: Map<string, CatalogEndpoint>) {
  const pricing: CatalogEndpoint[] = []

  for (const entry of log) {
    if (entry.kind === 'delete') {
      continue
    }

    const endpoint = afterEndpoints.get(entry.id)
    if (endpoint === undefined || endpoint.pricing === null) {
      continue
    }

    if (entry.kind === 'create' || touchesPricing(entry.changeset)) {
      pricing.push(endpoint)
    }
  }

  return pricing
}

function touchesPricing(changeset: IChange[] | undefined) {
  if (changeset === undefined) {
    return false
  }
  return changeset.some((change) => change.key === 'pricing')
}

function planKeyed<T>(args: {
  before: Map<string, T>
  after: Map<string, T>
  comparable: (value: T) => object
  options?: DiffOptions
}): ProjectionPlan<T> {
  const upserts: T[] = []
  const deletes: string[] = []
  const log: ProjectionLog[] = []
  const ids = [...new Set([...args.before.keys(), ...args.after.keys()])].toSorted()

  for (const id of ids) {
    const prev = args.before.get(id)
    const next = args.after.get(id)

    if (prev !== undefined && next === undefined) {
      deletes.push(id)
      log.push({ id, kind: 'delete' })
      continue
    }

    if (prev === undefined && next !== undefined) {
      upserts.push(next)
      log.push({ id, kind: 'create' })
      continue
    }

    if (prev === undefined || next === undefined) {
      continue
    }

    const changeset = diff(args.comparable(prev), args.comparable(next), args.options) ?? []
    if (changeset.length === 0) {
      continue
    }

    upserts.push(next)
    log.push({ id, kind: 'update', changeset })
  }

  return { upserts, deletes, log }
}

function indexEndpoints(catalog: Catalog) {
  const map = new Map<string, CatalogEndpoint>()
  for (const item of catalog.data.values()) {
    if (item.endpoints === null) {
      continue
    }
    for (const [endpoint_id, endpoint] of item.endpoints) {
      map.set(endpoint_id, endpoint)
    }
  }
  return map
}
