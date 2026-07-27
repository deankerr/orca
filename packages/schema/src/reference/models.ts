// The raw shape mirrors the upstream payload; the canonical shape is grouped by what a field is
// (identity, capability, defaults, limits, timestamps).

// * Layer 1 for the model entity: parse one raw upstream model copy, emit the canonical row.
// * ⚠️ `RawModel` is STRICT — decoded with `onExcessProperty: 'error'` — because an unknown key
// * upstream is the signal we most want, and the only place we can still see it is here.
// * Everything downstream (the store's lanes) reads the canonical shape permissively instead.
import * as Schema from 'effect/Schema'

// * upstream uses "" interchangeably with null on several string fields
const emptyToNull = (value: string | null) => (value === '' ? null : value)

// * key presence varies per model; values observed in the 2026-07-24 pass. Carried verbatim into
// * the canonical shape — this is the heart of reasoning capability data.
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

// * ── raw ───────────────────────────────────────────────────────────────────────────────────
// * exactly as upstream embeds a model in every endpoint observation
const RawModel = Schema.Struct({
  author: Schema.String,
  author_display_name: Schema.String,
  context_length: Schema.Number,
  created_at: Schema.String,
  default_order: Schema.Array(Schema.String),
  default_parameters: Schema.Record(Schema.String, Schema.NullOr(Schema.Number)),
  default_stops: Schema.Array(Schema.String),
  default_system: Schema.NullOr(Schema.String),
  description: Schema.String,
  // * features.reasoning_config duplicates the top-level field on every model (verified);
  // * only chat_template_config carries occasional signal and is lifted out
  features: Schema.NullOr(
    Schema.Struct({
      chat_template_config: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
      reasoning_config: Schema.optional(Schema.Unknown),
    }),
  ),
  group: Schema.String,
  has_text_output: Schema.Boolean,
  hf_slug: Schema.NullOr(Schema.String),
  // * null on every model observed so far — nothing to model yet
  hf_updated_at: Schema.Null,
  // * always false in a public capture; hidden/private models never reach this API
  hidden: Schema.Boolean,
  input_modalities: Schema.Array(Schema.String),
  instruct_type: Schema.NullOr(Schema.String),
  is_private: Schema.Boolean,
  // * null on every model observed so far — nothing to model yet
  is_trainable_image: Schema.Null,
  // * only true/null observed — normalized to a plain boolean
  is_trainable_text: Schema.NullOr(Schema.Boolean),
  knowledge_cutoff: Schema.NullOr(Schema.String),
  limit_rpd: Schema.NullOr(Schema.Number),
  limit_rpm: Schema.NullOr(Schema.Number),
  model_version_group_id: Schema.NullOr(Schema.String),
  name: Schema.String,
  output_modalities: Schema.Array(Schema.String),
  permaslug: Schema.String,
  // * appeared upstream between 2026-07-24 and 2026-07-25 — absent before, null on every model
  // * since. Optional rather than adapted per era, because the value carries nothing either way.
  preview_audio: Schema.optional(Schema.Null),
  // * null on every model observed so far — nothing to model yet
  preview_thumbnail_url: Schema.Null,
  // * OR marketing copy — not a model fact
  promotion_message: Schema.NullOr(Schema.String),
  // * OR docs-UI hint — not a model fact
  quick_start_example_type: Schema.NullOr(Schema.String),
  reasoning_config: Schema.NullOr(ReasoningConfig),
  // * empty array on every model observed so far — nothing to model yet
  required_attestation_types: Schema.Array(Schema.String),
  // * null on every model observed so far — nothing to model yet
  router: Schema.Null,
  routing_error_message: Schema.NullOr(Schema.String),
  short_name: Schema.String,
  slug: Schema.String,
  supported_tts_voices: Schema.NullOr(Schema.Array(Schema.String)),
  supports_reasoning: Schema.Boolean,
  updated_at: Schema.String,
  warning_message: Schema.NullOr(Schema.String),
})

// * ── canonical ─────────────────────────────────────────────────────────────────────────────
// * One row per base model slug. Variants (`free`, `thinking`) live on scopes and endpoints,
// * never here: every embedded copy of a model is identical across its variants (verified).
// * `permaslug` is the versioned identity upstream, and it is a *column*, not part of the key.
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
  // * only observed key is should_hoist_and_merge_system_messages; null when empty
  chat_template_config: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),

  // * OR's provider routing preference. ⚠️ An *ordered* list — the order is the data, so it is
  // * carried verbatim rather than sorted. Changes are Monitor-worthy.
  default_order: Schema.Array(Schema.String),
  default_stops: Schema.Array(Schema.String),
  default_system: Schema.NullOr(Schema.String),
  // * only non-null sampling defaults are kept; null when the model sets none
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

const decodeRawModel = Schema.decodeUnknownSync(RawModel, { onExcessProperty: 'error' })

// * One embedded model copy in, one canonical model out. ⚠️ The same model is embedded once per
// * scope, so a pass yields many identical copies of it — deduping them (and asserting they really
// * are identical) belongs to whoever walks the pass, not here.
export function canonicalizeModel(raw: unknown): Model {
  const m = decodeRawModel(raw)

  // * drop null-valued sampling defaults; treat an all-null object as "none set"
  const defaults: Record<string, number> = {}
  for (const [key, value] of Object.entries(m.default_parameters)) {
    if (value !== null) {
      defaults[key] = value
    }
  }

  const chatTemplateConfig = m.features?.chat_template_config

  return {
    slug: m.slug,
    permaslug: m.permaslug,
    name: m.name,
    short_name: m.short_name,
    author: m.author,
    author_display_name: m.author_display_name,
    description: m.description,
    group: m.group,

    context_length: m.context_length,
    input_modalities: m.input_modalities,
    output_modalities: m.output_modalities,
    has_text_output: m.has_text_output,
    supports_reasoning: m.supports_reasoning,
    is_trainable_text: m.is_trainable_text === true,
    instruct_type: m.instruct_type,
    knowledge_cutoff: m.knowledge_cutoff,
    hf_slug: emptyToNull(m.hf_slug),
    supported_tts_voices: m.supported_tts_voices ?? [],
    reasoning_config: m.reasoning_config,
    chat_template_config:
      chatTemplateConfig && Object.keys(chatTemplateConfig).length > 0 ? chatTemplateConfig : null,

    default_order: m.default_order,
    default_stops: m.default_stops,
    default_system: m.default_system,
    default_parameters: Object.keys(defaults).length > 0 ? defaults : null,

    limit_rpm: m.limit_rpm,
    limit_rpd: m.limit_rpd,
    model_version_group_id: m.model_version_group_id,
    warning_message: emptyToNull(m.warning_message),
    routing_error_message: emptyToNull(m.routing_error_message),

    created_at: m.created_at,
    updated_at: m.updated_at,
  }
}
