// * Product current-view endpoints — parallel to legacy `or_views_endpoints`.
// *
// * Document shape mirrors `packages/entities/src/endpoint.ts` (`Endpoint` / `toEndpoint`).
// * This table is the Convex half of the engine → current-view pipeline; the worker writes
// * product cards here after pure planTransition decides delivery is needed.
// *
// * Open items (fill in when worker delivery lands):
// * - `unavailable_at` semantics are not settled (scope-based vs catalog-wide, clock source).
// *   Field is present so rows can hold a mark later without a schema rename.
//
import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Product card fields only — no storage clocks. Args for upsert mutations. */
export const vCurrentEndpointProduct = v.object({
  uuid: v.string(),

  model: v.object({
    slug: v.string(),
    version_slug: v.string(),
    variant: v.string(),

    name: v.string(),

    author_slug: v.string(),
    author_name: v.string(),

    or_added_at: v.number(),

    input_modalities: v.array(v.string()),
    output_modalities: v.array(v.string()),

    reasoning: v.boolean(),
  }),

  provider: v.object({
    slug: v.string(),
    tag_slug: v.string(),
    name: v.string(),
    model_id: v.string(),
    // * entities omit the key when upstream region is null
    region: v.optional(v.string()),
  }),

  data_policy: v.object({
    may_train_on_data: v.optional(v.boolean()),
    may_publish_data: v.optional(v.boolean()),
    shares_user_id: v.optional(v.boolean()),
    may_retain_data: v.optional(v.boolean()),
    data_retention_days: v.optional(v.number()),
  }),

  pricing: v.object({
    text_input: v.optional(v.number()),
    text_output: v.optional(v.number()),
    text_cache_read: v.optional(v.number()),
    text_cache_write: v.optional(v.number()),
    audio_input: v.optional(v.number()),
    audio_cache_write: v.optional(v.number()),
    image_input: v.optional(v.number()),
    image_output: v.optional(v.number()),
    web_search: v.optional(v.number()),
    discount: v.optional(v.number()),
  }),

  limits: v.object({
    text_input_tokens: v.optional(v.number()),
    image_input_tokens: v.optional(v.number()),
    requests_per_minute: v.optional(v.number()),
    requests_per_day: v.optional(v.number()),
  }),

  max_output: v.number(),

  context_length: v.number(),
  quantization: v.string(),
  supported_parameters: v.array(v.string()),

  completions: v.boolean(),
  chat_completions: v.boolean(),
  implicit_caching: v.boolean(),
  native_web_search: v.boolean(),

  moderated: v.boolean(),
  deranked: v.boolean(),
  disabled: v.boolean(),

  stats: v.optional(
    v.object({
      p50_throughput: v.number(),
      p50_latency: v.number(),
    }),
  ),
})

export const currentEndpointsTable = defineTable(
  vCurrentEndpointProduct.extend({
    updated_at: v.number(),
    // * Semantics unsettled — optional storage slot only.
    unavailable_at: v.optional(v.number()),
  }),
)
  .index('by_uuid', ['uuid'])
  .index('by_model_slug', ['model.slug'])
  .index('by_provider_slug', ['provider.slug'])
