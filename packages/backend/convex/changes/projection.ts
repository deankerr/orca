import { baseProviderSlug } from '../../shared/utils'
import type { Doc, Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'
import type { EndpointProjection } from '../catalog/endpoints'
import { endpoints } from '../catalog/endpoints'
import { models } from '../catalog/models'
import { providers } from '../catalog/providers'

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
  pricing?: EndpointProjection['pricing']
}

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

export type EntityEvent =
  | { kind: 'entity_available'; change_id: Id<'or_views_changes'> }
  | { kind: 'entity_unavailable'; change_id: Id<'or_views_changes'> }
  | { kind: 'entity_updated'; fields: FieldChange[] }

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

const IGNORED_ENDPOINT_FIELDS = new Set([
  'stream_cancellation',
  'file_urls',
  'multipart',
  'status',
  'mandatory_reasoning',
])

const EXCLUDED_PATHS = new Set(['variable_pricings'])

const PATH_REWRITES: Record<string, string> = {
  'limits.text_output_tokens': 'max_output',
  'pricing.cache_read': 'pricing.text_cache_read',
  'pricing.cache_write': 'pricing.text_cache_write',
  'pricing.audio_cache_input': 'pricing.audio_cache_write',
  'pricing.internal_reasoning': 'pricing.reasoning_output',
  'pricing.request': 'pricing.per_request',
  'data_policy.can_publish': 'data_policy.may_publish_data',
  'data_policy.retains_prompts': 'data_policy.may_retain_data',
  'data_policy.retains_prompts_days': 'data_policy.data_retention_days',
  'data_policy.training': 'data_policy.may_train_on_data',
  'data_policy.requires_user_ids': 'data_policy.shares_user_id',
}

function computeArrayDiff(before: unknown[], after: unknown[]): ArrayDiffItem[] {
  const beforeSet = new Set(before.map(String))
  const afterSet = new Set(after.map(String))
  const all = new Set([...beforeSet, ...afterSet])

  return [...all]
    .toSorted((a, b) => a.localeCompare(b))
    .map((value) => {
      let status: ArrayDiffItem['status'] = 'stable'
      if (beforeSet.has(value)) {
        status = afterSet.has(value) ? 'stable' : 'removed'
      } else {
        status = 'added'
      }

      return {
        value,
        status,
      }
    })
}

function createFieldChange(doc: Doc<'or_views_changes'>): FieldChange {
  const { path } = doc
  if (path === undefined || path === '') {
    throw new Error(`Update change ${doc._id} missing path`)
  }

  const rewrittenPath = PATH_REWRITES[path] ?? path

  if (Array.isArray(doc.before) && Array.isArray(doc.after) && path !== 'variable_pricings') {
    return {
      kind: 'set_updated',
      change_id: doc._id,
      path: rewrittenPath,
      items: computeArrayDiff(doc.before, doc.after),
    }
  }

  if (doc.before === undefined) {
    return {
      kind: 'field_added',
      change_id: doc._id,
      path: rewrittenPath,
      value: doc.after,
    }
  }

  if (doc.after === undefined) {
    return {
      kind: 'field_removed',
      change_id: doc._id,
      path: rewrittenPath,
      value: doc.before,
    }
  }

  return {
    kind: 'field_updated',
    change_id: doc._id,
    path: rewrittenPath,
    before: doc.before,
    after: doc.after,
  }
}

function entityKey(doc: Doc<'or_views_changes'>): string {
  if (doc.entity_type === 'provider') {
    return `provider:${doc.provider_slug}`
  }

  if (doc.entity_type === 'model') {
    return `model:${doc.model_slug}`
  }

  return `endpoint:${doc.endpoint_uuid}`
}

async function enrichModelRef(ctx: QueryCtx, slug: string): Promise<ModelRef> {
  const model = await models.get.handler(ctx, { slug })
  if (!model) {
    return { slug }
  }

  return {
    slug,
    name: model.name,
    description: model.description,
    input_modalities: model.input_modalities,
    output_modalities: model.output_modalities,
    reasoning: model.reasoning,
    warning_message: model.warning_message,
    promotion_message: model.promotion_message,
  }
}

async function enrichProviderRef(ctx: QueryCtx, slug: string): Promise<ProviderRef> {
  const baseSlug = baseProviderSlug(slug)
  const provider = await providers.get.handler(ctx, { slug: baseSlug })
  if (!provider) {
    return { slug }
  }

  return { slug, name: provider.name }
}

async function enrichEndpointRef(ctx: QueryCtx, uuid: string): Promise<EndpointRef> {
  const endpoint = await endpoints.get.handler(ctx, { uuid })
  if (!endpoint) {
    return { uuid }
  }

  return {
    uuid,
    context_length: endpoint.context_length,
    max_output: endpoint.max_output,
    pricing: endpoint.pricing,
  }
}

async function createEntityChange(
  ctx: QueryCtx,
  doc: Doc<'or_views_changes'>,
  event: EntityEvent,
): Promise<EntityChange> {
  const { crawl_id } = doc

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

export function filterChangeDocs(docs: Doc<'or_views_changes'>[]) {
  return docs.filter(
    (doc) =>
      (doc.path_level_1 === undefined ||
        doc.path_level_1 === '' ||
        !IGNORED_ENDPOINT_FIELDS.has(doc.path_level_1)) &&
      (doc.path === undefined || doc.path === '' || !EXCLUDED_PATHS.has(doc.path)),
  )
}

export async function createEntityChanges(
  ctx: QueryCtx,
  docs: Doc<'or_views_changes'>[],
): Promise<EntityChange[]> {
  const result: EntityChange[] = []
  const updatesByEntity = new Map<string, Doc<'or_views_changes'>[]>()

  for (const doc of docs) {
    if (doc.change_kind === 'create') {
      result.push(
        await createEntityChange(ctx, doc, { kind: 'entity_available', change_id: doc._id }),
      )
      continue
    }

    if (doc.change_kind === 'delete') {
      result.push(
        await createEntityChange(ctx, doc, { kind: 'entity_unavailable', change_id: doc._id }),
      )
      continue
    }

    const key = entityKey(doc)
    const bucket = updatesByEntity.get(key)
    if (bucket) {
      bucket.push(doc)
    } else {
      updatesByEntity.set(key, [doc])
    }
  }

  for (const [, bucket] of updatesByEntity) {
    const [firstDoc] = bucket
    if (firstDoc === undefined) {
      continue
    }

    result.push(
      await createEntityChange(ctx, firstDoc, {
        kind: 'entity_updated',
        fields: bucket.map(createFieldChange),
      }),
    )
  }

  return result
}
