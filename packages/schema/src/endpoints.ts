// oxlint-disable sort-keys -- fields are grouped by what they are (identity, provider handle,
// serving shape, capability, commercial, policy) and stored in declaration order. Alphabetising
// would scatter exactly the groupings that carry the lane decisions.

// * The endpoint: one (model variant × provider config) offering, the atom of pricing and
// * capability, keyed by a stable upstream UUID. Also the only entity whose churn forced the
// * lane split, so this file is where the design is visible.
// *
// * Measured over 40 consecutive passes / 39 transitions (`bun run churn` in packages/processes),
// * every canonical endpoint field that moved at all:
// *
// * | field                  | transitions | changes | endpoints | lane                        |
// * | ---------------------- | ----------- | ------- | --------- | --------------------------- |
// * | `status`               | 39/39       | 1447    | 250       | series — flips every pass   |
// * | `display_pricing`      | 33/39       | 48      | 15        | not stored — labels only    |
// * | `pricing`              | 33/39       | 48      | 15        | partly stored — see below   |
// * | `pricing_version_id`   | 8/39        | 13      | 10        | series — detector, not data |
// * | `pricing_json`         | 6/39        | 10      | 10        | dictionary, per SKU         |
// * | `supported_parameters` | 2/39        | 2       | 2         | durable                     |
// * | `features`             | 1/39        | 1       | 1         | dictionary, per flag        |
// * | `supports_tool_para…`  | 1/39        | 1       | 1         | durable                     |
// *
// * Everything else — 30-odd columns including every capability flag, limit and policy field —
// * did not move once. Two things follow, and they are the whole reason for the lanes:
// *
// * 1. ⚠️ `status` alone would re-version all of them, every pass. In a single wide row it
// *    generates roughly an order of magnitude more versions per year than the entire budget the
// *    architecture is sized for, each carrying a full copy of ~30 unchanged columns.
// * 2. ⚠️ Every one of those 48 `pricing` moves, and all 144 `display_pricing` price moves, come
// *    from ONE drifting scalar: `discount`. The three keys that moved (`prompt`, `completion`,
// *    `input_cache_read`) are each exactly the list SKU × (1 - discount), so a fractional discount
// *    change rewrites all of them and every display row. Stored as endpoint columns, one scalar
// *    would look like a flood of price changes — which is what the current pipeline's "pricing is
// *    ~86% of change volume" figure is measuring. Routing `discount` to the series lane and
// *    deriving the effective price collapses all of it to one series row per drift.
// *
// * ⚠️ The fields that *look* operational — `is_deranked`, `is_disabled`, `capacity_tpm`,
// * `deprecation_date`, `limit_rpm`, `limit_rpd` — measured completely static, so they stay in
// * the durable row. That is a measurement, not a belief: `status` was "occasional" once too.
// * They are the first candidates the churn alarm should be expected to move.
import * as Schema from 'effect/Schema'

import {
  Bit,
  Json,
  NullableBit,
  NullableJson,
  bit,
  columnsOf,
  json,
  list,
  nullableBit,
} from './lanes.ts'
import type { Lane } from './lanes.ts'

// * ── canonical input ───────────────────────────────────────────────────────────────────────
// * How the store reads a canonical (Layer 1) endpoint. Deliberately *permissive about extra
// * keys*: the canonical row already passed a strict parse upstream, where an unknown key is a
// * wanted signal. Here the job is the opposite — take what we store and ignore the rest, which
// * is what lets a consumer read an artifact written by a newer canonicalizer.
// *
// * Fields read but deliberately not stored are declared anyway, with the reason: a drop should
// * be visible at the boundary, not silently absent.
export const Endpoint = Schema.Struct({
  // identity — `id` is stable and confirmed globally unique; the scope columns are also this
  // row's evidence, which is what makes endpoint close-out precise rather than conservative
  id: Schema.String,
  model_variant_slug: Schema.String,
  model_variant_permaslug: Schema.String,
  variant: Schema.String,

  // provider handle. ⚠️ These are ENDPOINT properties referring to a provider, not denormalized
  // provider fields — the same slug appears under different display names. `provider_name` is
  // the only reliable join to the provider entity. See notes/data-architecture/provider-identity.md
  provider_slug: Schema.String,
  provider_name: Schema.String,
  provider_display_name: Schema.String,
  provider_model_id: Schema.String,
  provider_region: Schema.NullOr(Schema.String),

  // serving shape
  quantization: Schema.String,
  context_length: Schema.Number,
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  max_completion_tokens: Schema.NullOr(Schema.Number),
  max_tokens_per_image: Schema.NullOr(Schema.Number),

  // capability
  supports_reasoning: Schema.Boolean,
  supports_multipart: Schema.Boolean,
  supports_tool_parameters: Schema.Boolean,
  can_abort: Schema.Boolean,
  has_chat_completions: Schema.Boolean,
  has_completions: Schema.Boolean,
  moderation_required: Schema.Boolean,
  supported_parameters: Schema.Array(Schema.String),
  excluded_parameters: Schema.Array(Schema.String),
  allowed_passthrough_parameters: Schema.Array(Schema.String),
  // ⚠️ modality-specific, and non-null on text endpoints with a *different* meaning — only
  // interpretable within a modality group. See notes/data-architecture/modality-split.md
  supported_image_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  supported_video_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
  // * the same field, a different variation: Layer 1 declares `features` as a strict struct of
  // * the 16 known flags, because an unknown flag there is a signal worth failing on. Here it is
  // * a dictionary, because upstream adds flags without notice and the store's job is to hold
  // * them at a grain where one flag flipping touches one row.
  features: Schema.Record(Schema.String, Schema.Unknown),

  // commercial and operational state
  is_free: Schema.Boolean,
  is_byok: Schema.Boolean,
  is_byok_only: Schema.Boolean,
  is_deranked: Schema.Boolean,
  is_disabled: Schema.Boolean,
  capacity_tpm: Schema.NullOr(Schema.Number),
  deprecation_date: Schema.NullOr(Schema.String),
  limit_rpm: Schema.NullOr(Schema.Number),
  limit_rpd: Schema.NullOr(Schema.Number),

  // * endpoint policy is authoritative for behaviour — endpoints override their provider's — so
  // * ⚠️ no provider-level behavioural claim is ever trustworthy. The policy *document* URLs are
  // * provider-stable and live on the provider entity instead.
  data_policy: Schema.Struct({
    can_publish: Schema.Boolean,
    requires_user_ids: Schema.NullOr(Schema.Boolean),
    retains_prompts: Schema.Boolean,
    retention_days: Schema.NullOr(Schema.Number),
    training: Schema.Boolean,
    training_openrouter: Schema.Boolean,
  }),

  // * The provider's own price map, and the closest thing to a source of truth: adapter-namespaced
  // * keys ("openai_responses:prompt_tokens"), ~203 distinct names across ~1,050 endpoints, and the
  // * set grows. Fans out into the pricing dictionary lane, one row per key.
  // * ⚠️ These are LIST prices, not effective ones — see `discount` below.
  // * ⚠️ And it is not purely prices. The same map carries `long_context_threshold` (a token
  // * count), `flex_tier_multiplier` / `priority_tier_multiplier` (ratios),
  // * `bfl:upstream_cost_cents` (OpenRouter's own cost, apparently leaked) and `informational_*`
  // * figures that are nonetheless the numbers shown to users. All stored as they arrive; sorting
  // * out which are "really prices" is interpretation, and doing it now would bake in a reading of
  // * fields that are provider-specific and barely understood.
  pricing_json: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number])),
  // * Upstream's NORMALIZATION of the above into a common per-unit dollar view — not a mirror of
  // * it. Measured against `pricing_json × (1 - discount)` over a full pass, its keys split three
  // * ways: exactly reproducible from a SKU (`prompt`, `completion`, `input_cache_read`, …); a unit
  // * conversion at a factor not in the data (`image_token`/`image_output`; `input_cache_write` =
  // * `cache_write_storage_hours` ÷ 12, verified 33/33); or a price with no SKU behind it at all
  // * (`web_search`, taking one of four apparently hand-keyed values on 71 endpoints).
  // * ⚠️ Every numeric key is stored regardless of which group it falls in. Excluding the
  // * reproducible ones was tempting and wrong twice over: the split is a measurement that goes
  // * stale the moment upstream changes a formula, and reproducing a value ourselves would mean
  // * reproducing upstream's exact arithmetic — their strings carry the real rationals of it
  // * (`cache_write_storage_hours / 12` renders as `0.00000008333333333333334`).
  // * The volume worry that motivated excluding them was misplaced: in a narrow dictionary lane a
  // * discount drift writes three small rows, not a 45-column entity version. Suppressing the noise
  // * is the changeset view's job, at read time, where the policy is revisable.
  // * ❓ `overrides` is the long-context price table (78 endpoints) — non-scalar, so not stored;
  // * it is the same unresolved question as `tiers`.
  pricing: Schema.Record(Schema.String, Schema.Unknown),
  // * read, NOT stored — the presentation view. Its prices are the same normalized numbers as
  // * `pricing`, so it adds no price information, but ⚠️ it is the only place exotic SKU semantics
  // * are *labelled* ("Image Output (moodboards)") — real information we are choosing not to store
  // * yet, because matching its entries back onto `pricing_json` SKU keys is unsolved.
  // * ❓ Where SKU labels live is an open question, not a decided drop.
  display_pricing: Schema.Array(Schema.Unknown),
  // * read, NOT stored — per-tier (flex/priority) pricing variants on ~53 endpoints. Its shape
  // * is not yet modelled. ❓ The likely home is a third key column on the pricing lane,
  // * `(endpoint_id, tier, sku)`; left out until the shape is understood rather than guessed.
  tiers: Schema.Unknown,
  // * routed to the series lane — an opaque upstream id, measured a strict *superset* of price
  // * change (every SKU movement came with a new id; the id also moved 3 times with no movement).
  // * That makes it a usable cheap detector and an unusable change record, so it is kept as a
  // * series we can keep testing that claim against, not as an endpoint fact.
  pricing_version_id: Schema.String,
  // * routed to the series lane — see the table above
  status: Schema.Number,

  // upstream timestamp; `or_` prefixed once stored, so it can never be mistaken for ours
  created_at: Schema.String,
})
export type Endpoint = Schema.Schema.Type<typeof Endpoint>

// * ── durable lane ──────────────────────────────────────────────────────────────────────────
// * What the offering *is*. SCD2, and expected to sit still: the whole point of moving `status`
// * and the pricing views out is that a version row here means a real capability change.
export const EndpointVersionRow = Schema.Struct({
  id: Schema.String,
  model_variant_slug: Schema.String,
  model_variant_permaslug: Schema.String,
  variant: Schema.String,

  provider_slug: Schema.String,
  provider_name: Schema.String,
  provider_display_name: Schema.String,
  provider_model_id: Schema.String,
  provider_region: Schema.NullOr(Schema.String),

  quantization: Schema.String,
  context_length: Schema.Number,
  max_prompt_tokens: Schema.NullOr(Schema.Number),
  max_completion_tokens: Schema.NullOr(Schema.Number),
  max_tokens_per_image: Schema.NullOr(Schema.Number),

  supports_reasoning: Bit,
  supports_multipart: Bit,
  supports_tool_parameters: Bit,
  can_abort: Bit,
  has_chat_completions: Bit,
  has_completions: Bit,
  moderation_required: Bit,
  supported_parameters: Json,
  excluded_parameters: Json,
  allowed_passthrough_parameters: Json,
  // * JSON columns, not dictionary lanes: measured completely static, and only meaningful within
  // * a modality group — so there is no read that wants them at key grain yet.
  supported_image_parameters: NullableJson,
  supported_video_parameters: NullableJson,

  is_free: Bit,
  is_byok: Bit,
  is_byok_only: Bit,
  is_deranked: Bit,
  is_disabled: Bit,
  capacity_tpm: Schema.NullOr(Schema.Number),
  deprecation_date: Schema.NullOr(Schema.String),
  limit_rpm: Schema.NullOr(Schema.Number),
  limit_rpd: Schema.NullOr(Schema.Number),

  policy_can_publish: Bit,
  policy_requires_user_ids: NullableBit,
  policy_retains_prompts: Bit,
  policy_retention_days: Schema.NullOr(Schema.Number),
  policy_training: Bit,
  policy_training_openrouter: Bit,

  or_created_at: Schema.String,
})
export type EndpointVersionRow = Schema.Schema.Type<typeof EndpointVersionRow>

export const ENDPOINT_VERSIONS: Lane = {
  table: 'endpoint_versions',
  kind: 'versions',
  keys: ['id'],
  columns: columnsOf(EndpointVersionRow),
  // * an endpoint's evidence is its own request scope, carried in its own columns — so it can be
  // * closed out precisely, without waiting for a fully-observed pass
  closeOut: { on: 'scope', columns: ['model_variant_permaslug', 'variant'] },
}

export const toEndpointVersion = (endpoint: Endpoint): EndpointVersionRow => ({
  id: endpoint.id,
  model_variant_slug: endpoint.model_variant_slug,
  model_variant_permaslug: endpoint.model_variant_permaslug,
  variant: endpoint.variant,

  provider_slug: endpoint.provider_slug,
  provider_name: endpoint.provider_name,
  provider_display_name: endpoint.provider_display_name,
  provider_model_id: endpoint.provider_model_id,
  provider_region: endpoint.provider_region,

  quantization: endpoint.quantization,
  context_length: endpoint.context_length,
  max_prompt_tokens: endpoint.max_prompt_tokens,
  max_completion_tokens: endpoint.max_completion_tokens,
  max_tokens_per_image: endpoint.max_tokens_per_image,

  supports_reasoning: bit(endpoint.supports_reasoning),
  supports_multipart: bit(endpoint.supports_multipart),
  supports_tool_parameters: bit(endpoint.supports_tool_parameters),
  can_abort: bit(endpoint.can_abort),
  has_chat_completions: bit(endpoint.has_chat_completions),
  has_completions: bit(endpoint.has_completions),
  moderation_required: bit(endpoint.moderation_required),
  supported_parameters: list(endpoint.supported_parameters),
  excluded_parameters: list(endpoint.excluded_parameters),
  allowed_passthrough_parameters: list(endpoint.allowed_passthrough_parameters),
  supported_image_parameters:
    endpoint.supported_image_parameters === null ? null : json(endpoint.supported_image_parameters),
  supported_video_parameters:
    endpoint.supported_video_parameters === null ? null : json(endpoint.supported_video_parameters),

  is_free: bit(endpoint.is_free),
  is_byok: bit(endpoint.is_byok),
  is_byok_only: bit(endpoint.is_byok_only),
  is_deranked: bit(endpoint.is_deranked),
  is_disabled: bit(endpoint.is_disabled),
  capacity_tpm: endpoint.capacity_tpm,
  deprecation_date: endpoint.deprecation_date,
  limit_rpm: endpoint.limit_rpm,
  limit_rpd: endpoint.limit_rpd,

  policy_can_publish: bit(endpoint.data_policy.can_publish),
  policy_requires_user_ids: nullableBit(endpoint.data_policy.requires_user_ids),
  policy_retains_prompts: bit(endpoint.data_policy.retains_prompts),
  policy_retention_days: endpoint.data_policy.retention_days,
  policy_training: bit(endpoint.data_policy.training),
  policy_training_openrouter: bit(endpoint.data_policy.training_openrouter),

  or_created_at: endpoint.created_at,
})

// * ── pricing dictionary lane ───────────────────────────────────────────────────────────────
// * One SCD2 row per (endpoint, source, key). An open key set that grows without notice is a
// * child table, never a JSON column — so that one price change touches one row and reads as one
// * field diff instead of an unreadable text delta over a blob.
// *
// * Two sources share the lane because they are the same kind of fact — a price for a unit of
// * work — and every read wants them together:
// *   `upstream`   an entry from `pricing_json`. Mostly list prices, but ⚠️ not only: the same map
// *                carries thresholds (`long_context_threshold`), tier multipliers
// *                (`flex_tier_multiplier`), OpenRouter's own cost basis (`upstream_cost_cents`)
// *                and `informational_*` figures. Stored as-is — deciding which of those are
// *                "really prices" is interpretation, and we are not doing that yet.
// *   `normalized` a numeric key of `pricing`, OpenRouter's own per-unit view. Some of these are
// *                reproducible from a SKU at the endpoint's discount and some are not; both are
// *                stored, because knowing which is which is a measurement that will go stale, and
// *                reproducing them ourselves would mean reproducing upstream's arithmetic exactly.
// * ⚠️ `source` is part of the key, not decoration: the two namespaces are disjoint today (SKUs
// * carry an `adapter:` prefix, normalized keys don't) and nothing upstream guarantees they stay
// * that way.
export const EndpointPriceRow = Schema.Struct({
  endpoint_id: Schema.String,
  source: Schema.Literals(['upstream', 'normalized']),
  // * e.g. `openai_responses:prompt_tokens`, or `web_search`. ⚠️ Naming is inconsistent upstream
  // * (some kebab-case, some snake_case) — carried verbatim, never normalized.
  sku: Schema.String,
  // * ⚠️ The comparison identity, and the reason this lane needs three value columns at all.
  // * Upstream ships whatever notation was authored — `"0.25e-6"`, `".03e-6"`, `".30e-6"`, and raw
  // * JSON numbers like `3e-7`, sometimes mixed inside one object. Comparing the authored text
  // * would record a re-authoring as a price change, so this column holds the number in one
  // * canonical rendering and the diff is taken on it. Non-numeric values pass through unchanged,
  // * which is what keeps the comparison total.
  value: Schema.String,
  // * exactly what upstream wrote. Provenance: recorded, never compared — see ENDPOINT_PRICING.
  value_raw: Schema.String,
  // * the same number for arithmetic — sorting and range filters in the grid, which want an index
  // * rather than a CAST. Derived from `value`, so it adds no meaning; null when not a number.
  value_num: Schema.NullOr(Schema.Number),
})
export type EndpointPriceRow = Schema.Schema.Type<typeof EndpointPriceRow>

export const ENDPOINT_PRICING: Lane = {
  table: 'endpoint_pricing',
  kind: 'dictionary',
  keys: ['endpoint_id', 'source', 'sku'],
  columns: columnsOf(EndpointPriceRow),
  // * a price has no request scope of its own — it lives and dies with its endpoint
  closeOut: { on: 'parent', lane: 'endpoint_versions', key: 'endpoint_id' },
  // * the authored notation is how upstream said it, not what it said
  provenance: ['value_raw'],
}

// * `discount` is routed to the series lane; `overrides` is not a scalar (it is the long-context
// * price table, and its own unresolved question — see the canonical shape above)
const NOT_A_PRICE = new Set(['discount', 'overrides'])

const priceRow = (
  endpoint_id: string,
  source: 'upstream' | 'normalized',
  sku: string,
  value: unknown,
): EndpointPriceRow => {
  const raw = String(value)
  const parsed = Number(raw)
  const numeric = Number.isFinite(parsed) && raw.trim() !== ''
  return {
    endpoint_id,
    source,
    sku,
    // * one rendering per number, whatever notation it arrived in: `".30e-6"` and `"0.0000003"`
    // * both become `"3e-7"`. Non-numbers keep their text so nothing is silently equated.
    value: numeric ? String(parsed) : raw,
    value_raw: raw,
    value_num: numeric ? parsed : null,
  }
}

export const toEndpointPrices = (endpoint: Endpoint): EndpointPriceRow[] => [
  ...Object.entries(endpoint.pricing_json).map(([sku, value]) =>
    priceRow(endpoint.id, 'upstream', sku, value),
  ),
  ...Object.entries(endpoint.pricing)
    .filter(([key, value]) => !NOT_A_PRICE.has(key) && Number.isFinite(Number(value)))
    .map(([key, value]) => priceRow(endpoint.id, 'normalized', key, value)),
]

// * ── features dictionary lane ───────────────────────────────────────────────────────────────
// * One SCD2 row per (endpoint, flag). A dictionary because the *key set* is open — upstream adds
// * flags without notice — not because it churns; it moved once in 39 transitions. Values are
// * heterogeneous (booleans, a string, two nested objects), so each is stored as its own small
// * JSON value. ⚠️ Endpoint-level features are not model-level features, and outside the text
// * modality most of them are boilerplate.
export const EndpointFeatureRow = Schema.Struct({
  endpoint_id: Schema.String,
  feature: Schema.String,
  value: Json,
})
export type EndpointFeatureRow = Schema.Schema.Type<typeof EndpointFeatureRow>

export const ENDPOINT_FEATURES: Lane = {
  table: 'endpoint_features',
  kind: 'dictionary',
  keys: ['endpoint_id', 'feature'],
  columns: columnsOf(EndpointFeatureRow),
  closeOut: { on: 'parent', lane: 'endpoint_versions', key: 'endpoint_id' },
}

export const toEndpointFeatures = (endpoint: Endpoint): EndpointFeatureRow[] =>
  Object.entries(endpoint.features).map(([feature, value]) => ({
    endpoint_id: endpoint.id,
    feature,
    value: json(value),
  }))

// * ── series lane ───────────────────────────────────────────────────────────────────────────
// * Append-only transitions: a row is written only when the value differs from the last one
// * stored for that (endpoint, field). Nothing is ever closed out, so no evidence question
// * arises — and no fidelity is lost, because transitions plus observation coverage reconstruct
// * the value at any instant ("it was still -2 at pass N" is a join, not a stored row).
export const EndpointSeriesRow = Schema.Struct({
  endpoint_id: Schema.String,
  // * ⚠️ Which fields appear here is data, not schema — see ENDPOINT_SERIES_FIELDS. That is the
  // * design's answer to a source whose churn character drifts without warning: rerouting a
  // * newly-flapping field is a config change plus a rebuild, not a migration.
  field: Schema.String,
  value: Schema.String,
  value_num: Schema.NullOr(Schema.Number),
})
export type EndpointSeriesRow = Schema.Schema.Type<typeof EndpointSeriesRow>

export const ENDPOINT_SERIES: Lane = {
  table: 'endpoint_series',
  kind: 'series',
  keys: ['endpoint_id', 'field'],
  columns: columnsOf(EndpointSeriesRow),
  closeOut: { on: 'never' },
}

// * The routing policy, as data: which endpoint fields are held as a series instead of versioned
// * in the durable row, paired with how to read each one. Every entry earned its place by
// * measurement, recorded in the table at the top of this file.
// * ⚠️ This list is part of the store's schema version — changing it changes what the durable
// * lane's version rows mean, so it bumps the version and triggers a rebuild.
export const ENDPOINT_SERIES_FIELDS: ReadonlyArray<{
  readonly field: string
  readonly read: (endpoint: Endpoint) => string | number
}> = [
  // * 39/39 transitions, 1447 changes across 250 endpoints. ❓ Whether this is now health-based
  // * auto-deranking (it was described as manually set, and nothing manual moves this often) is
  // * worth answering: if it tracks upstream's status heuristics it is a candidate product
  // * signal on this lane, not merely noise routed away from the durable row.
  { field: 'status', read: (endpoint) => endpoint.status },
  // * ⚠️ The promotional discount applied to every price on this endpoint, and the single cause of
  // * all pricing churn: `pricing.prompt` equals the list SKU × (1 - discount) exactly, on 95/95
  // * discounted endpoints. On ~15 of the 95 it drifts every pass by fractions of a percent
  // * (0.4495 → 0.4515), which moved three `pricing` keys and every `display_pricing` row with it —
  // * 33/39 transitions of apparent price change from one scalar.
  // * It is here because it churns, NOT because it is telemetry: it is a price, and the effective
  // * price stays exactly reconstructible as the pricing lane's list value × (1 - this).
  // * ❓ Why it drifts at all is unanswered. A fixed provider price expressed as a discount off a
  // * moving reference would do this; so would a rate pegged to something we can't see.
  { field: 'discount', read: (endpoint) => Number(endpoint.pricing.discount ?? 0) || 0 },
  // * 8/39 transitions. A detector for price movement, not a record of it.
  { field: 'pricing_version_id', read: (endpoint) => endpoint.pricing_version_id },
]

export const toEndpointSeries = (endpoint: Endpoint): EndpointSeriesRow[] =>
  ENDPOINT_SERIES_FIELDS.map(({ field, read }) => {
    const value = read(endpoint)
    return {
      endpoint_id: endpoint.id,
      field,
      value: String(value),
      value_num: typeof value === 'number' ? value : null,
    }
  })
