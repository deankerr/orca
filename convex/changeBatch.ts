// Shared change batch — queries all changes for a crawl_id and groups into a
// discriminated union by entity type.
//
// Entity data (names, descriptions, pricing, etc.) lives on the enriched refs
// within each ORCAChange — no separate entity lookups needed here.

import { v } from 'convex/values'

import { query } from './_generated/server'
import { getByCrawlId, type ORCAChange } from './db/or/views/changes'

// -- Output types

export type EndpointChangeGroup = {
  entity_type: 'endpoint'
  uuid: string
  model_slug: string
  provider_slug: string
  changes: ORCAChange[]
}

export type ModelChangeGroup = {
  entity_type: 'model'
  slug: string
  changes: ORCAChange[]
  children: EndpointChangeGroup[]
}

export type ProviderChangeGroup = {
  entity_type: 'provider'
  slug: string
  changes: ORCAChange[]
}

export type ChangeGroup = ModelChangeGroup | ProviderChangeGroup

// -- Grouping

type EndpointORCAChange = Extract<ORCAChange, { entity_type: 'endpoint' }>

function groupEndpointChildren(changes: EndpointORCAChange[]): EndpointChangeGroup[] {
  const byUuid = Map.groupBy(changes, (c) => c.endpoint.uuid)

  return [...byUuid.entries()].map(([uuid, epChanges]) => ({
    entity_type: 'endpoint' as const,
    uuid,
    model_slug: epChanges[0]!.model.slug,
    provider_slug: epChanges[0]!.provider.slug,
    changes: epChanges as ORCAChange[],
  }))
}

function groupChanges(allChanges: ORCAChange[]): ChangeGroup[] {
  // separate by top-level entity type
  const providerChanges = allChanges.filter(
    (c): c is Extract<ORCAChange, { entity_type: 'provider' }> => c.entity_type === 'provider',
  )
  const modelAndEndpoint = allChanges.filter(
    (c): c is Extract<ORCAChange, { entity_type: 'model' | 'endpoint' }> =>
      c.entity_type !== 'provider',
  )

  // provider groups
  const byProvider = Map.groupBy(providerChanges, (c) => c.provider.slug)
  const providers: ProviderChangeGroup[] = [...byProvider.entries()].map(([slug, changes]) => ({
    entity_type: 'provider',
    slug,
    changes: changes as ORCAChange[],
  }))

  // model groups with endpoint children
  const byModel = Map.groupBy(modelAndEndpoint, (c) => c.model.slug)
  const models: ModelChangeGroup[] = [...byModel.entries()].map(([slug, changes]) => {
    const modelChanges: ORCAChange[] = changes.filter((c) => c.entity_type === 'model')
    const endpointChanges = changes.filter(
      (c): c is EndpointORCAChange => c.entity_type === 'endpoint',
    )

    return {
      entity_type: 'model',
      slug,
      changes: modelChanges,
      children: groupEndpointChildren(endpointChanges),
    }
  })

  // flat list, sorted by slug
  const groups: ChangeGroup[] = [...models, ...providers]
  return groups.toSorted((a, b) => a.slug.localeCompare(b.slug))
}

// -- Query

export const byCrawlId = query({
  args: { crawl_id: v.string() },
  handler: async (ctx, { crawl_id }) => {
    const changes = await getByCrawlId(ctx, crawl_id)
    return groupChanges(changes)
  },
})
