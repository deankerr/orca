// * The store's only input boundary: one canonicalized pass (Layer 1 output) plus the
// * observations that produced it. Decoded with Effect Schema so a malformed payload fails
// * loudly at the edge with a readable path, never deep in the ingest loop.
// *
// * Unlike the Layer 1 canonicalizers (which parse upstream strictly, because an unknown
// * upstream key is a wanted signal), this boundary is deliberately permissive about *extra*
// * fields: the canonical row already passed a strict parse upstream, and the store is a
// * simplified projection of it. Excess keys are dropped by Schema.Struct, which is what lets
// * the loader POST canonical artifacts verbatim.
import * as Schema from 'effect/Schema'

// * one observation per request scope. `status` is any HTTP status the scope returned;
// * `error` is a transport failure. Exactly one of them is present.
const Observation = Schema.Struct({
  error: Schema.optional(Schema.String),
  permaslug: Schema.String,
  slug: Schema.String,
  status: Schema.optional(Schema.Number),
  variant: Schema.optional(Schema.String),
})
export type Observation = Schema.Schema.Type<typeof Observation>

const CanonicalModel = Schema.Struct({
  author: Schema.String,
  context_length: Schema.Number,
  created_at: Schema.String,
  default_order: Schema.Array(Schema.String),
  group: Schema.String,
  input_modalities: Schema.Array(Schema.String),
  instruct_type: Schema.NullOr(Schema.String),
  name: Schema.String,
  output_modalities: Schema.Array(Schema.String),
  permaslug: Schema.String,
  short_name: Schema.String,
  slug: Schema.String,
  supports_reasoning: Schema.Boolean,
  updated_at: Schema.String,
  warning_message: Schema.NullOr(Schema.String),
})

const CanonicalProvider = Schema.Struct({
  byok_enabled: Schema.Boolean,
  datacenters: Schema.Array(Schema.String),
  display_name: Schema.String,
  headquarters: Schema.NullOr(Schema.String),
  moderation_required: Schema.Boolean,
  privacy_policy_url: Schema.NullOr(Schema.String),
  slug: Schema.String,
  status_page_url: Schema.NullOr(Schema.String),
  terms_of_service_url: Schema.NullOr(Schema.String),
})

const CanonicalEndpoint = Schema.Struct({
  can_abort: Schema.Boolean,
  capacity_tpm: Schema.NullOr(Schema.Number),
  context_length: Schema.Number,
  data_policy: Schema.Struct({
    can_publish: Schema.Boolean,
    requires_user_ids: Schema.NullOr(Schema.Boolean),
    retains_prompts: Schema.Boolean,
    retention_days: Schema.NullOr(Schema.Number),
    training: Schema.Boolean,
  }),
  id: Schema.String,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
  limit_rpd: Schema.NullOr(Schema.Number),
  limit_rpm: Schema.NullOr(Schema.Number),
  max_completion_tokens: Schema.NullOr(Schema.Number),
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  model_variant_permaslug: Schema.String,
  model_variant_slug: Schema.String,
  // * the source of truth for price: adapter-namespaced SKU keys, decimal strings (a few
  // * adapters ship raw numbers). Fans out into endpoint_pricing, one row per SKU.
  pricing_json: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
  pricing_version_id: Schema.String,
  provider_name: Schema.String,
  provider_region: Schema.NullOr(Schema.String),
  provider_slug: Schema.String,
  quantization: Schema.String,
  status: Schema.Number,
  supported_parameters: Schema.Array(Schema.String),
  supports_reasoning: Schema.Boolean,
  variant: Schema.String,
})

export const Pass = Schema.Struct({
  captured_at: Schema.String,
  endpoints: Schema.Array(CanonicalEndpoint),
  models: Schema.Array(CanonicalModel),
  observations: Schema.Array(Observation),
  providers: Schema.Array(CanonicalProvider),
})
export type Pass = Schema.Schema.Type<typeof Pass>

export const decodePass = Schema.decodeUnknownEffect(Pass)

// * SQL-shaped values only: booleans become bits, lists and dictionaries become JSON text.
export type Row = Record<string, string | number | null>

const bit = (value: boolean | null) => (value === null ? null : Number(value))

// * lists are sorted before storage so an upstream reordering isn't recorded as a change.
// * The unsorted original survives in the canonical artifact, so this is revisable — which is
// * the whole point of the store being derived. `default_order` is exempt: it IS an order.
const list = (values: readonly string[]) => JSON.stringify([...values].toSorted())

export const projectModel = (m: Pass['models'][number]): Row => ({
  author: m.author,
  context_length: m.context_length,
  default_order: JSON.stringify(m.default_order),
  input_modalities: list(m.input_modalities),
  instruct_type: m.instruct_type,
  name: m.name,
  or_created_at: m.created_at,
  or_updated_at: m.updated_at,
  output_modalities: list(m.output_modalities),
  permaslug: m.permaslug,
  short_name: m.short_name,
  slug: m.slug,
  supports_reasoning: bit(m.supports_reasoning),
  tokenizer: m.group,
  warning_message: m.warning_message,
})

export const projectProvider = (p: Pass['providers'][number]): Row => ({
  byok_enabled: bit(p.byok_enabled),
  datacenters: list(p.datacenters),
  headquarters: p.headquarters,
  moderation_required: bit(p.moderation_required),
  name: p.display_name,
  privacy_policy_url: p.privacy_policy_url,
  slug: p.slug,
  status_page_url: p.status_page_url,
  terms_of_service_url: p.terms_of_service_url,
})

export const projectEndpoint = (e: Pass['endpoints'][number]): Row => ({
  can_abort: bit(e.can_abort),
  capacity_tpm: e.capacity_tpm,
  context_length: e.context_length,
  id: e.id,
  is_deranked: bit(e.is_deranked),
  is_disabled: bit(e.is_disabled),
  limit_rpd: e.limit_rpd,
  limit_rpm: e.limit_rpm,
  max_completion_tokens: e.max_completion_tokens,
  max_prompt_tokens: e.max_prompt_tokens,
  model_variant_permaslug: e.model_variant_permaslug,
  model_variant_slug: e.model_variant_slug,
  or_status: e.status,
  policy_can_publish: bit(e.data_policy.can_publish),
  policy_requires_user_ids: bit(e.data_policy.requires_user_ids),
  policy_retains_prompts: bit(e.data_policy.retains_prompts),
  policy_retention_days: e.data_policy.retention_days,
  policy_training: bit(e.data_policy.training),
  pricing_version_id: e.pricing_version_id,
  provider_name: e.provider_name,
  provider_region: e.provider_region,
  provider_slug: e.provider_slug,
  quantization: e.quantization,
  supported_parameters: list(e.supported_parameters),
  supports_reasoning: bit(e.supports_reasoning),
  variant: e.variant,
})
