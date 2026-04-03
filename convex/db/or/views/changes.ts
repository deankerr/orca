import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from '../../../_generated/dataModel'
import type { QueryCtx } from '../../../_generated/server'
import { baseProviderSlug } from '../../../shared/utils'
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
  .index('by_model_slug__provider_slug__crawl_id', ['model_slug', 'provider_slug', 'crawl_id'])
  .index('by_entity_type__model_slug__crawl_id', ['entity_type', 'model_slug', 'crawl_id'])
  .index('by_provider_slug__crawl_id', ['provider_slug', 'crawl_id'])

// -- EntityChange pipeline
//
// Transforms raw change docs into enriched, grouped EntityChange[].
//
// Each EntityChange represents one entity event in a crawl:
// - entity_available / entity_unavailable — lifecycle events (no field data)
// - entity_updated — carries FieldChange[] with the actual diffs
//
// Grouping key is (entity_type, entity_id, lifecycle). Field updates for the
// same entity are collected into a single entity_updated event. Lifecycle
// events always stand alone.
//
// Refs are enriched inline via Convex's query cache — repeated lookups for
// the same slug/uuid are free within a query.

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

// * Field-level diffs — pure change payload, no entity context

export type ArrayDiffItem = {
  value: string
  status: 'stable' | 'added' | 'removed'
}

export type FieldChange =
  | {
      kind: 'field_updated'
      change_id: Id<'or_views_changes'>
      path: string
      before: unknown
      after: unknown
    }
  | { kind: 'field_added'; change_id: Id<'or_views_changes'>; path: string; value: unknown }
  | { kind: 'field_removed'; change_id: Id<'or_views_changes'>; path: string; value: unknown }
  | {
      kind: 'set_updated'
      change_id: Id<'or_views_changes'>
      path: string
      items: ArrayDiffItem[]
    }

// * Entity event — what happened to this entity in this crawl

export type EntityEvent =
  | { kind: 'entity_available'; change_id: Id<'or_views_changes'> }
  | { kind: 'entity_unavailable'; change_id: Id<'or_views_changes'> }
  | { kind: 'entity_updated'; fields: FieldChange[] }

// * Per-entity change group — one per (entity_type, entity_id, lifecycle)

type EntityChangeBase = {
  crawl_id: string
  event: EntityEvent
}

export type ProviderChange = EntityChangeBase & {
  entity_type: 'provider'
  provider: ProviderRef
}

export type ModelChange = EntityChangeBase & {
  entity_type: 'model'
  model: ModelRef
}

export type EndpointChange = EntityChangeBase & {
  entity_type: 'endpoint'
  model: ModelRef
  provider: ProviderRef
  endpoint: EndpointRef
}

export type EntityChange = ProviderChange | ModelChange | EndpointChange

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

// * Field change builder — converts an update doc into a FieldChange

function buildFieldChange(doc: Doc<'or_views_changes'>): FieldChange {
  const path = doc.path
  if (!path) throw new Error(`Update change ${doc._id} missing path`)
  const rewritten = PATH_REWRITES[path] ?? path

  // known string[] fields — both sides must be arrays
  if (Array.isArray(doc.before) && Array.isArray(doc.after) && path !== 'variable_pricings') {
    return {
      kind: 'set_updated',
      change_id: doc._id,
      path: rewritten,
      items: computeArrayDiff(doc.before, doc.after),
    }
  }

  // field added or removed on an existing entity
  if (doc.before === undefined) {
    return { kind: 'field_added', change_id: doc._id, path: rewritten, value: doc.after }
  }
  if (doc.after === undefined) {
    return { kind: 'field_removed', change_id: doc._id, path: rewritten, value: doc.before }
  }

  // scalar value updated
  return {
    kind: 'field_updated',
    change_id: doc._id,
    path: rewritten,
    before: doc.before,
    after: doc.after,
  }
}

// * Entity identity key — for grouping field updates by entity

function entityKey(doc: Doc<'or_views_changes'>): string {
  if (doc.entity_type === 'provider') return `provider:${doc.provider_slug}`
  if (doc.entity_type === 'model') return `model:${doc.model_slug}`
  return `endpoint:${doc.endpoint_uuid}`
}

// * Ref enrichment helpers
//
// Convex caches indexed queries for the lifetime of a query function, so
// repeated lookups for the same entity are free. No manual dedup needed.

async function enrichModelRef(ctx: QueryCtx, slug: string): Promise<ModelRef> {
  const m = await getModel(ctx, slug)
  if (!m) return { slug }
  const description = (await getModelDescription(ctx, slug)) ?? undefined
  return {
    slug,
    name: m.name,
    description,
    input_modalities: m.input_modalities,
    output_modalities: m.output_modalities,
    reasoning: m.reasoning,
    warning_message: m.warning_message,
    promotion_message: m.promotion_message,
  }
}

async function enrichProviderRef(ctx: QueryCtx, slug: string): Promise<ProviderRef> {
  // provider tag slugs may include a variant suffix (e.g. "deepinfra/fp4")
  const baseSlug = baseProviderSlug(slug)
  const p = await getProvider(ctx, baseSlug)
  if (!p) return { slug }
  return { slug, name: p.name }
}

async function enrichEndpointRef(ctx: QueryCtx, uuid: string): Promise<EndpointRef> {
  const ep = await getEndpoint(ctx, uuid)
  if (!ep) return { uuid }
  return { uuid, context_length: ep.context_length, max_output: ep.max_output, pricing: ep.pricing }
}

// * Build an enriched EntityChange from a doc + event

async function toEntityChange(
  ctx: QueryCtx,
  doc: Doc<'or_views_changes'>,
  event: EntityEvent,
): Promise<EntityChange> {
  const crawl_id = doc.crawl_id

  if (doc.entity_type === 'provider') {
    return {
      crawl_id,
      event,
      entity_type: 'provider',
      provider: await enrichProviderRef(ctx, doc.provider_slug),
    }
  }
  if (doc.entity_type === 'model') {
    return {
      crawl_id,
      event,
      entity_type: 'model',
      model: await enrichModelRef(ctx, doc.model_slug),
    }
  }
  return {
    crawl_id,
    event,
    entity_type: 'endpoint',
    model: await enrichModelRef(ctx, doc.model_slug),
    provider: await enrichProviderRef(ctx, doc.provider_tag_slug),
    endpoint: await enrichEndpointRef(ctx, doc.endpoint_uuid),
  }
}

// * Build enriched EntityChange[] from filtered docs
//
// Lifecycle docs (create/delete) each produce a standalone EntityChange.
// Update docs are grouped by entity, producing one entity_updated per entity.
// Refs are enriched inline — Convex's query cache makes repeated lookups free.

async function buildEntityChanges(
  ctx: QueryCtx,
  docs: Doc<'or_views_changes'>[],
): Promise<EntityChange[]> {
  const result: EntityChange[] = []
  const updatesByEntity = new Map<string, Doc<'or_views_changes'>[]>()

  for (const doc of docs) {
    // lifecycle events are standalone — one doc, one EntityChange
    if (doc.change_kind === 'create') {
      result.push(await toEntityChange(ctx, doc, { kind: 'entity_available', change_id: doc._id }))
      continue
    }
    if (doc.change_kind === 'delete') {
      result.push(
        await toEntityChange(ctx, doc, { kind: 'entity_unavailable', change_id: doc._id }),
      )
      continue
    }

    // field updates bucket by entity
    const key = entityKey(doc)
    const bucket = updatesByEntity.get(key)
    if (bucket) bucket.push(doc)
    else updatesByEntity.set(key, [doc])
  }

  // each bucket becomes one entity_updated event
  for (const [, bucket] of updatesByEntity) {
    const fields = bucket.map(buildFieldChange)
    result.push(await toEntityChange(ctx, bucket[0]!, { kind: 'entity_updated', fields }))
  }

  return result
}

// * Public API

const EXCLUDED_PATHS = ['variable_pricings']

function filterDocs(docs: Doc<'or_views_changes'>[]) {
  return docs.filter(
    (doc) =>
      (!doc.path_level_1 || !IGNORED_ENDPOINT_FIELDS.has(doc.path_level_1)) &&
      (!doc.path || !EXCLUDED_PATHS.includes(doc.path)),
  )
}

export async function getByCrawlId(ctx: QueryCtx, crawl_id: string): Promise<EntityChange[]> {
  const docs = await ctx.db
    .query('or_views_changes')
    .withIndex('by_crawl_id', (q) => q.eq('crawl_id', crawl_id))
    .collect()

  return buildEntityChanges(ctx, filterDocs(docs))
}
