import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { omit } from 'remeda'

import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { createTableVHelper } from '../../../lib/vTable'

export const table = defineTable({
  uuid: v.string(), // unique id

  // * model
  model: v.object({
    slug: v.string(), // primary index
    base_slug: v.string(), // secondary index
    version_slug: v.string(), // situationally important info
    variant: v.string(), // important info, e.g. `standard`, `free`

    name: v.string(), // display
    icon_url: v.string(), // deprecated

    author_slug: v.string(), // secondary index
    author_name: v.string(), // display

    or_added_at: v.number(),

    // * model intrinsic properties
    input_modalities: v.array(v.string()), // filter
    output_modalities: v.array(v.string()), // filter

    reasoning: v.boolean(), // filter
  }),

  // * provider identity
  provider: v.object({
    slug: v.string(), // secondary index, e.g. `google-vertex`, `deepinfra`, `anthropic`
    tag_slug: v.string(), // situationally important info, e.g. `google-vertex/europe`, `deepinfra/fp4`, `anthropic`

    name: v.string(), // display
    icon_url: v.string(), // deprecated

    model_id: v.string(), // info
    region: v.optional(v.string()),
  }),

  // * data policy
  data_policy: v.object({
    training: v.optional(v.boolean()),
    can_publish: v.optional(v.boolean()),
    requires_user_ids: v.optional(v.boolean()),

    retains_prompts: v.optional(v.boolean()),
    retains_prompts_days: v.optional(v.number()),
  }),

  // * pricing
  pricing: v.object({
    // per token -> display per millions tokens
    text_input: v.optional(v.number()),
    text_output: v.optional(v.number()),

    internal_reasoning: v.optional(v.number()),

    audio_input: v.optional(v.number()),
    audio_cache_input: v.optional(v.number()),

    cache_read: v.optional(v.number()),
    cache_write: v.optional(v.number()),

    // per unit -> display per thousand units
    image_input: v.optional(v.number()),
    image_output: v.optional(v.number()),

    // per request
    request: v.optional(v.number()), // deprecated
    web_search: v.optional(v.number()),

    // discount already applied
    discount: v.optional(v.number()), // e.g. 0.2
  }),

  variable_pricings: v.optional(
    v.array(
      v.object({
        type: v.literal('prompt-threshold'),
        threshold: v.number(),
        text_input: v.number(),
        text_output: v.number(),
        cache_read: v.optional(v.number()),
        cache_write: v.optional(v.number()),
      }),
    ),
  ),

  // * limits
  limits: v.object({
    text_input_tokens: v.optional(v.number()),
    text_output_tokens: v.optional(v.number()),

    image_input_tokens: v.optional(v.number()),
    images_per_input: v.optional(v.number()),

    requests_per_minute: v.optional(v.number()),
    requests_per_day: v.optional(v.number()),
  }),

  // * endpoint configuration
  context_length: v.number(),
  quantization: v.optional(v.string()),
  supported_parameters: v.array(v.string()),

  // * endpoint capability
  completions: v.boolean(),
  chat_completions: v.boolean(),
  stream_cancellation: v.boolean(), // ignore
  implicit_caching: v.boolean(),
  file_urls: v.boolean(), // ignore
  native_web_search: v.boolean(),
  multipart: v.boolean(), // ignore
  mandatory_reasoning: v.optional(v.boolean()), // broken - source location changed

  // * openrouter
  moderated: v.boolean(),
  deranked: v.boolean(),
  disabled: v.boolean(),
  status: v.number(), // ignore

  stats: v.optional(
    v.object({
      p50_throughput: v.number(),
      p50_latency: v.number(),
    }),
  ),

  // * orca
  unavailable_at: v.optional(v.number()),
  updated_at: v.number(),
})
  .index('by_model_or_added_at', ['model.or_added_at'])
  .index('by_model_slug', ['model.slug'])
  .index('by_provider_slug', ['provider.slug'])
  .index('by_uuid', ['uuid'])

export const vTable = createTableVHelper('or_views_endpoints', table.validator)

export async function collect(ctx: QueryCtx) {
  return ctx.db.query(vTable.name).collect()
}

export async function listByModelSlug(ctx: QueryCtx, modelSlug: string) {
  return ctx.db
    .query(vTable.name)
    .withIndex('by_model_slug', (q) => q.eq('model.slug', modelSlug))
    .collect()
}

export async function listByProviderSlug(ctx: QueryCtx, providerSlug: string) {
  return ctx.db
    .query(vTable.name)
    .withIndex('by_provider_slug', (q) => q.eq('provider.slug', providerSlug))
    .collect()
}

export async function insert(
  ctx: MutationCtx,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return ctx.db.insert(vTable.name, { ...data, updated_at: Date.now() })
}

export async function patch(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  updates: Partial<Omit<typeof vTable.validator.type, 'updated_at'>>,
) {
  await ctx.db.patch(id, { ...updates, updated_at: Date.now() })
}

export async function replace(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  await ctx.db.replace(id, { ...data, updated_at: Date.now() })
}

// -- Endpoint transform
//
// Canonical transform from raw endpoint docs to a consumer-friendly shape.
// Renames internal field names to clearer user-facing terminology.
// Drops deprecated, ignored, and broken fields.

type EndpointDoc = Doc<'or_views_endpoints'>

// * Sub-object transforms

function transformPricing(p: EndpointDoc['pricing']) {
  return {
    ...omit(p, ['internal_reasoning', 'audio_cache_input', 'cache_read', 'cache_write', 'request']),
    reasoning_output: p.internal_reasoning,
    audio_cache_write: p.audio_cache_input,
    text_cache_read: p.cache_read,
    text_cache_write: p.cache_write,
  }
}

function transformDataPolicy(dp: EndpointDoc['data_policy']) {
  return {
    may_train_on_data: dp.training,
    may_publish_data: dp.can_publish,
    shares_user_id: dp.requires_user_ids,
    may_retain_data: dp.retains_prompts,
    data_retention_days: dp.retains_prompts_days,
  }
}

function transformLimits(l: EndpointDoc['limits']) {
  return omit(l, ['text_output_tokens'])
}

// * Transform

export function transformEndpoint(doc: EndpointDoc) {
  return {
    ...omit(doc, [
      // sub-objects handled below
      'model',
      'provider',
      'pricing',
      'data_policy',
      'limits',
      // deprecated
      // (icon_url is inside model/provider, handled below)
      // ignore
      'stream_cancellation',
      'file_urls',
      'multipart',
      'status',
      // broken
      'mandatory_reasoning',
    ]),
    model: omit(doc.model, ['icon_url']),
    provider: omit(doc.provider, ['icon_url']),
    pricing: transformPricing(doc.pricing),
    data_policy: transformDataPolicy(doc.data_policy),
    limits: transformLimits(doc.limits),
    max_output: doc.limits.text_output_tokens ?? doc.context_length,
  }
}

export function transformEndpoints(docs: EndpointDoc[]) {
  return docs.map(transformEndpoint)
}

export type ORCAEndpoint = ReturnType<typeof transformEndpoint>

export async function get(ctx: QueryCtx, uuid: string) {
  const doc = await ctx.db
    .query(vTable.name)
    .withIndex('by_uuid', (q) => q.eq('uuid', uuid))
    .first()
  return doc ? transformEndpoint(doc) : null
}
