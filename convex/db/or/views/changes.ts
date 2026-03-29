import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { getModelDescription } from '../sources'
import { get as getEndpoint, type ORCAEndpoint } from './endpoints'
import { get as getModel } from './models'
import { get as getProvider } from './providers'

const changeKindValidator = v.union(v.literal('create'), v.literal('update'), v.literal('delete'))

const baseFields = {
  crawl_id: v.string(),
  previous_crawl_id: v.string(),

  change_kind: changeKindValidator,

  path: v.optional(v.string()),
  path_level_1: v.optional(v.string()),
  path_level_2: v.optional(v.string()),

  before: v.optional(v.any()),
  after: v.optional(v.any()),
}

const modelChangesValidator = v.object({
  entity_type: v.literal('model'),
  model_slug: v.string(),
  ...baseFields,
})

const endpointChangesValidator = v.object({
  entity_type: v.literal('endpoint'),
  model_slug: v.string(),
  provider_slug: v.string(),
  provider_tag_slug: v.string(),
  endpoint_uuid: v.string(),
  ...baseFields,
})

const providerChangesValidator = v.object({
  entity_type: v.literal('provider'),
  provider_slug: v.string(),
  ...baseFields,
})

export const table = defineTable(
  v.union(modelChangesValidator, providerChangesValidator, endpointChangesValidator),
)
  .index('by_previous_crawl_id__crawl_id', ['previous_crawl_id', 'crawl_id'])
  .index('by_crawl_id', ['crawl_id'])
  .index('by_change_kind', ['change_kind'])
  .index('by_entity_type__crawl_id', ['entity_type', 'crawl_id'])
  .index('by_model_slug__crawl_id', ['model_slug', 'crawl_id'])
  .index('by_entity_type__model_slug__crawl_id', ['entity_type', 'model_slug', 'crawl_id'])

export type ChangeTypeModelDoc = Extract<Doc<'or_views_changes'>, { entity_type: 'model' }>
export type ChangeTypeEndpointDoc = Extract<Doc<'or_views_changes'>, { entity_type: 'endpoint' }>

// -- ORCAChange transform
//
// Canonical transform from raw change docs to a consumer-friendly shape.
// Pure function — entity refs carry slug only by default. Consumers can
// enrich with names/details as a separate step when db context is available.
//
// Design notes:
// - Entity refs are objects ({ slug }) to allow future expansion (name, etc.)
//   without breaking the shape
// - Lifecycle uses appeared/disappeared rather than create/delete — entities
//   can vanish and return across crawls
// - Scalar updates carry raw before/after with no subtype — consumers check
//   for undefined themselves
// - Path rewriting happens once here, normalizing internal field names to
//   user-facing terminology
// - variable_pricings changes are excluded (filtered before transform)

// * Entity identity refs

export type ProviderRef = {
  slug: string
  name?: string
}

export type ModelRef = {
  slug: string
  name?: string
  description?: string
  input_modalities?: string[]
  output_modalities?: string[]
  reasoning?: boolean
  warning_message?: string
  promotion_message?: string
}

export type EndpointRef = {
  uuid: string
  context_length?: number
  max_output?: number
  pricing?: ORCAEndpoint['pricing']
}

// * Action discriminated union

export type ArrayDiffItem = {
  value: string
  status: 'stable' | 'added' | 'removed'
}

export type ChangeAction =
  | { kind: 'entity_available' }
  | { kind: 'entity_unavailable' }
  | { kind: 'field_updated'; path: string; before: unknown; after: unknown }
  | { kind: 'field_added'; path: string; value: unknown }
  | { kind: 'field_removed'; path: string; value: unknown }
  | { kind: 'set_updated'; path: string; items: ArrayDiffItem[] }

// * Per-entity change shapes

type ChangeBase = {
  change_id: Id<'or_views_changes'>
  crawl_id: string
  action: ChangeAction
}

export type ORCAProviderChange = ChangeBase & {
  entity_type: 'provider'
  provider: ProviderRef
}

export type ORCAModelChange = ChangeBase & {
  entity_type: 'model'
  model: ModelRef
}

export type ORCAEndpointChange = ChangeBase & {
  entity_type: 'endpoint'
  model: ModelRef
  provider: ProviderRef
  endpoint: EndpointRef
}

export type ORCAChange = ORCAProviderChange | ORCAModelChange | ORCAEndpointChange

// * Ignored endpoint fields — dropped from endpoint transform, filter from changes
const IGNORED_ENDPOINT_FIELDS = new Set([
  'stream_cancellation',
  'file_urls',
  'multipart',
  'status',
  'mandatory_reasoning',
])

// * Path rewriting — normalize internal field names to user-facing names

const PATH_REWRITES: Record<string, string> = {
  // limits
  'limits.text_output_tokens': 'max_output',
  // pricing
  'pricing.cache_read': 'pricing.text_cache_read',
  'pricing.cache_write': 'pricing.text_cache_write',
  'pricing.audio_cache_input': 'pricing.audio_cache_write',
  'pricing.internal_reasoning': 'pricing.reasoning_output',
  'pricing.request': 'pricing.per_request',
  // data_policy
  'data_policy.can_publish': 'data_policy.may_publish_data',
  'data_policy.retains_prompts': 'data_policy.may_retain_data',
  'data_policy.retains_prompts_days': 'data_policy.data_retention_days',
  'data_policy.training': 'data_policy.may_train_on_data',
  'data_policy.requires_user_ids': 'data_policy.shares_user_id',
}

// * Array diff computation

function computeArrayDiff(before: unknown[], after: unknown[]): ArrayDiffItem[] {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))
  const all = new Set([...beforeSet, ...afterSet])

  return [...all]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      value,
      status: !beforeSet.has(value) ? 'added' : !afterSet.has(value) ? 'removed' : 'stable',
    }))
}

// * Action builder

function buildAction(doc: Doc<'or_views_changes'>): ChangeAction {
  if (doc.change_kind === 'create') return { kind: 'entity_available' }
  if (doc.change_kind === 'delete') return { kind: 'entity_unavailable' }

  // update — must have a path
  const path = doc.path
  if (!path) throw new Error(`Update change ${doc._id} missing path`)
  const rewritten = PATH_REWRITES[path] ?? path

  // known string[] fields — both sides must be arrays
  if (Array.isArray(doc.before) && Array.isArray(doc.after) && path !== 'variable_pricings') {
    return { kind: 'set_updated', path: rewritten, items: computeArrayDiff(doc.before, doc.after) }
  }

  // field added or removed on an existing entity
  if (doc.before === undefined) return { kind: 'field_added', path: rewritten, value: doc.after }
  if (doc.after === undefined) return { kind: 'field_removed', path: rewritten, value: doc.before }

  // scalar value updated
  return { kind: 'field_updated', path: rewritten, before: doc.before, after: doc.after }
}

// * Transform a single change doc

export function transformChange(doc: Doc<'or_views_changes'>): ORCAChange {
  const action = buildAction(doc)
  const base = { change_id: doc._id, crawl_id: doc.crawl_id, action }

  if (doc.entity_type === 'provider') {
    return { ...base, entity_type: 'provider', provider: { slug: doc.provider_slug } }
  }

  if (doc.entity_type === 'model') {
    return { ...base, entity_type: 'model', model: { slug: doc.model_slug } }
  }

  // endpoint — provider_tag_slug is the full provider id (may include variant suffix)
  return {
    ...base,
    entity_type: 'endpoint',
    model: { slug: doc.model_slug },
    provider: { slug: doc.provider_tag_slug },
    endpoint: { uuid: doc.endpoint_uuid },
  }
}

// * Ref enrichment — batch-load entities and populate optional ref fields

async function enrichRefs(ctx: QueryCtx, changes: ORCAChange[]): Promise<ORCAChange[]> {
  // collect unique keys
  const modelSlugs = new Set<string>()
  const providerSlugs = new Set<string>()
  const endpointUuids = new Set<string>()

  for (const c of changes) {
    if (c.entity_type === 'model') modelSlugs.add(c.model.slug)
    if (c.entity_type === 'provider') providerSlugs.add(c.provider.slug)
    if (c.entity_type === 'endpoint') {
      modelSlugs.add(c.model.slug)
      providerSlugs.add(c.provider.slug)
      endpointUuids.add(c.endpoint.uuid)
    }
  }

  // batch load
  const [modelEntries, descriptionEntries, providerEntries, endpointEntries] = await Promise.all([
    Promise.all([...modelSlugs].map(async (s) => [s, await getModel(ctx, s)] as const)),
    Promise.all([...modelSlugs].map(async (s) => [s, await getModelDescription(ctx, s)] as const)),
    Promise.all([...providerSlugs].map(async (s) => [s, await getProvider(ctx, s)] as const)),
    Promise.all([...endpointUuids].map(async (u) => [u, await getEndpoint(ctx, u)] as const)),
  ])

  const models = new Map(modelEntries)
  const descriptions = new Map(descriptionEntries)
  const providers = new Map(providerEntries)
  const endpoints = new Map(endpointEntries)

  // populate refs
  return changes.map((c) => {
    if (c.entity_type === 'model') {
      const m = models.get(c.model.slug)
      if (!m) return c
      return {
        ...c,
        model: {
          slug: c.model.slug,
          name: m.name,
          description: descriptions.get(c.model.slug) ?? undefined,
          input_modalities: m.input_modalities,
          output_modalities: m.output_modalities,
          reasoning: m.reasoning,
          warning_message: m.warning_message,
          promotion_message: m.promotion_message,
        },
      }
    }

    if (c.entity_type === 'provider') {
      const p = providers.get(c.provider.slug)
      if (!p) return c
      return { ...c, provider: { slug: c.provider.slug, name: p.name } }
    }

    if (c.entity_type === 'endpoint') {
      const m = models.get(c.model.slug)
      const p = providers.get(c.provider.slug)
      const ep = endpoints.get(c.endpoint.uuid)
      return {
        ...c,
        model: m ? { slug: c.model.slug, name: m.name } : c.model,
        provider: p ? { slug: c.provider.slug, name: p.name } : c.provider,
        endpoint: ep
          ? {
              uuid: c.endpoint.uuid,
              context_length: ep.context_length,
              max_output: ep.max_output,
              pricing: ep.pricing,
            }
          : c.endpoint,
      }
    }

    return c
  })
}

// * Public API

const EXCLUDED_PATHS = ['variable_pricings']

export async function getByCrawlId(ctx: QueryCtx, crawl_id: string): Promise<ORCAChange[]> {
  const docs = await ctx.db
    .query('or_views_changes')
    .withIndex('by_crawl_id', (q) => q.eq('crawl_id', crawl_id))
    .collect()

  const filtered = docs.filter(
    (doc) =>
      (!doc.path_level_1 || !IGNORED_ENDPOINT_FIELDS.has(doc.path_level_1)) &&
      (!doc.path || !EXCLUDED_PATHS.includes(doc.path)),
  )

  const changes = filtered.map(transformChange)
  return enrichRefs(ctx, changes)
}
