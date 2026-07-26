// oxlint-disable sort-keys -- fields are grouped by what they are and stored in declaration
// order; alphabetising would scatter the groupings that carry the lane decisions.

// * The model: the abstract thing ("openai/gpt-5.2"), one row per base slug. `permaslug` is the
// * versioned identity upstream, and it is a *column*, not part of the key — a model moving from
// * `gpt-5.2-20251211` to a newer permaslug is a new version of the same model, which is exactly
// * what SCD2 records. Variants (`free`, `thinking`) live on scopes and endpoints, never here:
// * every embedded copy of a model is identical across its variants (verified).
// *
// * Measured over 40 consecutive passes / 39 transitions: **not one model field moved**, and no
// * model was born or died. So there is nothing here to route away, and the durable lane holds
// * everything. ⚠️ That window contains no model launch, which is when models actually move —
// * the measurement says "no churn between launches", not "no churn".
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

// * the richest capability object upstream ships, and a closed key set of 10 — so it becomes
// * columns rather than a dictionary lane or a blob. Presence varies per model; every key is
// * optional and independently nullable.
const ReasoningConfig = Schema.Struct({
  default_reasoning_effort: Schema.optional(Schema.NullOr(Schema.String)),
  default_reasoning_enabled: Schema.optional(Schema.NullOr(Schema.Boolean)),
  end_token: Schema.optional(Schema.NullOr(Schema.String)),
  is_mandatory_reasoning: Schema.optional(Schema.NullOr(Schema.Boolean)),
  reasoning_return_mechanism: Schema.optional(Schema.NullOr(Schema.String)),
  start_token: Schema.optional(Schema.NullOr(Schema.String)),
  supported_reasoning_efforts: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  supports_reasoning_effort: Schema.optional(Schema.NullOr(Schema.Boolean)),
  supports_reasoning_max_tokens: Schema.optional(Schema.NullOr(Schema.Boolean)),
  system_prompt: Schema.optional(Schema.NullOr(Schema.String)),
})

// * ── canonical input ───────────────────────────────────────────────────────────────────────
export const Model = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  name: Schema.String,
  short_name: Schema.String,
  author: Schema.String,
  author_display_name: Schema.String,
  description: Schema.String,
  // * upstream calls this `group` — its model family / tokenizer grouping
  group: Schema.String,

  context_length: Schema.Number,
  input_modalities: Schema.Array(Schema.String),
  output_modalities: Schema.Array(Schema.String),
  has_text_output: Schema.Boolean,
  supports_reasoning: Schema.Boolean,
  is_trainable_text: Schema.Boolean,
  instruct_type: Schema.NullOr(Schema.String),
  knowledge_cutoff: Schema.NullOr(Schema.String),
  hf_slug: Schema.NullOr(Schema.String),
  supported_tts_voices: Schema.Array(Schema.String),
  reasoning_config: Schema.NullOr(ReasoningConfig),
  // * opaque upstream config; one key ever observed. A JSON column because its whole shape is
  // * one fact and there is no read that wants it at key grain.
  chat_template_config: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),

  // * OR's provider routing preference. ⚠️ An *ordered* list — the order is the data, so it is
  // * stored verbatim rather than sorted. Config rather than fact, but changes are Monitor-worthy.
  default_order: Schema.Array(Schema.String),
  default_stops: Schema.Array(Schema.String),
  default_system: Schema.NullOr(Schema.String),
  // * sampling defaults, per parameter — fans out into the parameters dictionary lane
  default_parameters: Schema.NullOr(Schema.Record(Schema.String, Schema.Number)),

  limit_rpm: Schema.NullOr(Schema.Number),
  limit_rpd: Schema.NullOr(Schema.Number),
  // * ❓ present on 33 models only; semantics unknown (links permaslug generations?)
  model_version_group_id: Schema.NullOr(Schema.String),
  warning_message: Schema.NullOr(Schema.String),
  routing_error_message: Schema.NullOr(Schema.String),

  created_at: Schema.String,
  updated_at: Schema.String,
})
export type Model = Schema.Schema.Type<typeof Model>

// * ── durable lane ──────────────────────────────────────────────────────────────────────────
export const ModelVersionRow = Schema.Struct({
  slug: Schema.String,
  permaslug: Schema.String,
  name: Schema.String,
  short_name: Schema.String,
  author: Schema.String,
  author_display_name: Schema.String,
  description: Schema.String,
  // * renamed from upstream's `group`, which is a reserved SQL keyword and would need quoting
  // * at every use site
  tokenizer_group: Schema.String,

  context_length: Schema.Number,
  input_modalities: Json,
  output_modalities: Json,
  has_text_output: Bit,
  supports_reasoning: Bit,
  is_trainable_text: Bit,
  instruct_type: Schema.NullOr(Schema.String),
  knowledge_cutoff: Schema.NullOr(Schema.String),
  hf_slug: Schema.NullOr(Schema.String),
  supported_tts_voices: Json,

  // * `reasoning_config` flattened: a closed key set is columns, so these are filterable in the
  // * grid rather than buried in a blob. Names drop the redundant inner "reasoning".
  reasoning_default_effort: Schema.NullOr(Schema.String),
  reasoning_default_enabled: NullableBit,
  reasoning_mandatory: NullableBit,
  reasoning_supports_effort: NullableBit,
  reasoning_supports_max_tokens: NullableBit,
  reasoning_supported_efforts: NullableJson,
  reasoning_return_mechanism: Schema.NullOr(Schema.String),
  reasoning_start_token: Schema.NullOr(Schema.String),
  reasoning_end_token: Schema.NullOr(Schema.String),
  reasoning_system_prompt: Schema.NullOr(Schema.String),
  chat_template_config: NullableJson,

  default_order: Json,
  default_stops: Json,
  default_system: Schema.NullOr(Schema.String),

  limit_rpm: Schema.NullOr(Schema.Number),
  limit_rpd: Schema.NullOr(Schema.Number),
  model_version_group_id: Schema.NullOr(Schema.String),
  warning_message: Schema.NullOr(Schema.String),
  routing_error_message: Schema.NullOr(Schema.String),

  or_created_at: Schema.String,
  or_updated_at: Schema.String,
})
export type ModelVersionRow = Schema.Schema.Type<typeof ModelVersionRow>

export const MODEL_VERSIONS: Lane = {
  table: 'model_versions',
  kind: 'versions',
  keys: ['slug'],
  columns: columnsOf(ModelVersionRow),
  // * ⚠️ Models are deduped across the whole pass, so no single scope's evidence covers one:
  // * the same model is embedded in every endpoint of every one of its variants. The honest rule
  // * is the conservative one — close nothing unless every scope in the pass answered.
  // * ❓ Models could be scoped by permaslug with a little bookkeeping; worth doing only if
  // * conservative close-out proves too sticky in practice.
  closeOut: { on: 'pass' },
}

// * `reasoning_config` flattened into its ten columns. Its own function because the decision to
// * make a closed key set into columns is the interesting part, and because every key is
// * independently optional *and* independently nullable — absent and null both mean "not set".
// * every key is optional, so an absent config and an absent key are the same state
const NO_REASONING: NonNullable<Model['reasoning_config']> = {}
const text = (value: string | null | undefined) => value ?? null

const reasoningColumns = (config: Model['reasoning_config']) => {
  const reasoning = config ?? NO_REASONING
  const efforts = reasoning.supported_reasoning_efforts
  return {
    reasoning_default_effort: text(reasoning.default_reasoning_effort),
    reasoning_default_enabled: nullableBit(reasoning.default_reasoning_enabled),
    reasoning_mandatory: nullableBit(reasoning.is_mandatory_reasoning),
    reasoning_supports_effort: nullableBit(reasoning.supports_reasoning_effort),
    reasoning_supports_max_tokens: nullableBit(reasoning.supports_reasoning_max_tokens),
    reasoning_supported_efforts: efforts ? list(efforts) : null,
    reasoning_return_mechanism: text(reasoning.reasoning_return_mechanism),
    reasoning_start_token: text(reasoning.start_token),
    reasoning_end_token: text(reasoning.end_token),
    reasoning_system_prompt: text(reasoning.system_prompt),
  }
}

export const toModelVersion = (model: Model): ModelVersionRow => ({
  slug: model.slug,
  permaslug: model.permaslug,
  name: model.name,
  short_name: model.short_name,
  author: model.author,
  author_display_name: model.author_display_name,
  description: model.description,
  tokenizer_group: model.group,

  context_length: model.context_length,
  input_modalities: list(model.input_modalities),
  output_modalities: list(model.output_modalities),
  has_text_output: bit(model.has_text_output),
  supports_reasoning: bit(model.supports_reasoning),
  is_trainable_text: bit(model.is_trainable_text),
  instruct_type: model.instruct_type,
  knowledge_cutoff: model.knowledge_cutoff,
  hf_slug: model.hf_slug,
  supported_tts_voices: list(model.supported_tts_voices),

  ...reasoningColumns(model.reasoning_config),
  chat_template_config:
    model.chat_template_config === null ? null : json(model.chat_template_config),

  // * verbatim, not sorted — this list IS an order
  default_order: json(model.default_order),
  default_stops: list(model.default_stops),
  default_system: model.default_system,

  limit_rpm: model.limit_rpm,
  limit_rpd: model.limit_rpd,
  model_version_group_id: model.model_version_group_id,
  warning_message: model.warning_message,
  routing_error_message: model.routing_error_message,

  or_created_at: model.created_at,
  or_updated_at: model.updated_at,
})

// * ── parameters dictionary lane ─────────────────────────────────────────────────────────────
// * One SCD2 row per (model, parameter). Measured small — 4 distinct parameter names over 137 rows
// * across 423 models — so this lane is not justified by volume or by the key set being wide. It
// * is justified by *grain*: "default temperature changed 0.7 → 1.0" is a change a user wants to
// * read as a field diff, and a JSON column can only offer a text delta. The key set is also
// * upstream's sampling parameter names, which nothing stops from growing.
export const ModelParameterRow = Schema.Struct({
  slug: Schema.String,
  parameter: Schema.String,
  value: Schema.Number,
})
export type ModelParameterRow = Schema.Schema.Type<typeof ModelParameterRow>

export const MODEL_PARAMETERS: Lane = {
  table: 'model_parameters',
  kind: 'dictionary',
  keys: ['slug', 'parameter'],
  columns: columnsOf(ModelParameterRow),
  closeOut: { on: 'parent', lane: 'model_versions', key: 'slug' },
}

export const toModelParameters = (model: Model): ModelParameterRow[] =>
  Object.entries(model.default_parameters ?? {}).map(([parameter, value]) => ({
    slug: model.slug,
    parameter,
    value,
  }))

// * ── series lane ───────────────────────────────────────────────────────────────────────────
// * Empty today: nothing on a model measured above the routing threshold. The table exists
// * anyway, and that is the point — rerouting a field that starts flapping has to be a config
// * change, and it can only be one if the destination is already there.
// * ⚠️ `default_order` is the field to watch. It is OR's routing preference, so it is the model
// * field most likely to acquire machine-driven churn, and it sits in the durable row today.
export const ModelSeriesRow = Schema.Struct({
  slug: Schema.String,
  field: Schema.String,
  value: Schema.String,
  value_num: Schema.NullOr(Schema.Number),
})
export type ModelSeriesRow = Schema.Schema.Type<typeof ModelSeriesRow>

export const MODEL_SERIES: Lane = {
  table: 'model_series',
  kind: 'series',
  keys: ['slug', 'field'],
  columns: columnsOf(ModelSeriesRow),
  closeOut: { on: 'never' },
}

export const MODEL_SERIES_FIELDS: ReadonlyArray<{
  readonly field: string
  readonly read: (model: Model) => string | number
}> = []

export const toModelSeries = (model: Model): ModelSeriesRow[] =>
  MODEL_SERIES_FIELDS.map(({ field, read }) => {
    const value = read(model)
    return {
      slug: model.slug,
      field,
      value: String(value),
      value_num: typeof value === 'number' ? value : null,
    }
  })
