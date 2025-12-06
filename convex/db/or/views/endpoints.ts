import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { type MutationCtx, type QueryCtx } from '../../../_generated/server'
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
    request: v.optional(v.number()),
    web_search: v.optional(v.number()), // ignored

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
  stream_cancellation: v.boolean(), // ignored
  implicit_caching: v.boolean(),
  file_urls: v.boolean(), // ignored
  native_web_search: v.boolean(),
  multipart: v.boolean(), // ignored
  mandatory_reasoning: v.optional(v.boolean()), // inconsistently available upstream

  // * openrouter
  moderated: v.boolean(),
  deranked: v.boolean(),
  disabled: v.boolean(),
  status: v.number(), // ignored

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
  return await ctx.db.query(vTable.name).collect()
}

export async function listByModelSlug(ctx: QueryCtx, modelSlug: string) {
  return await ctx.db
    .query(vTable.name)
    .withIndex('by_model_slug', (q) => q.eq('model.slug', modelSlug))
    .collect()
}

export async function listByProviderSlug(ctx: QueryCtx, providerSlug: string) {
  return await ctx.db
    .query(vTable.name)
    .withIndex('by_provider_slug', (q) => q.eq('provider.slug', providerSlug))
    .collect()
}

export async function insert(
  ctx: MutationCtx,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return await ctx.db.insert(vTable.name, { ...data, updated_at: Date.now() })
}

export async function patch(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  updates: Partial<Omit<typeof vTable.validator.type, 'updated_at'>>,
) {
  return await ctx.db.patch(id, { ...updates, updated_at: Date.now() })
}

export async function replace(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return await ctx.db.replace(id, { ...data, updated_at: Date.now() })
}
