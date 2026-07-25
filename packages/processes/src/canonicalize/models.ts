import { z } from 'zod'

// * upstream uses "" interchangeably with null on several string fields
const emptyToNull = (s: string | null) => (s === '' ? null : s)

// * key presence varies per model; values observed in the 2026-07-24 pass. Kept verbatim in
// * the canonical shape (as a JSON column) — this is the heart of reasoning capability data
// * and we'll drill into it as we go.
const ReasoningConfig = z.strictObject({
  default_reasoning_effort: z.string().nullish(),
  default_reasoning_enabled: z.boolean().nullish(),
  end_token: z.string().nullish(),
  is_mandatory_reasoning: z.boolean().nullish(),
  reasoning_return_mechanism: z.string().nullish(),
  start_token: z.string().nullish(),
  supported_reasoning_efforts: z.array(z.string()).nullish(),
  supports_reasoning_effort: z.boolean().nullish(),
  supports_reasoning_max_tokens: z.boolean().nullish(),
  system_prompt: z.string().nullish(),
})

// * raw model exactly as upstream embeds it in every endpoint observation — strict, so any
// * schema drift in a new pass fails loudly here instead of silently passing fields through
const RawModel = z.strictObject({
  author: z.string(),
  author_display_name: z.string(),
  context_length: z.number(),
  created_at: z.string(),
  default_order: z.array(z.string()),
  default_parameters: z.record(z.string(), z.number().nullable()),
  default_stops: z.array(z.string()),
  default_system: z.string().nullable(),
  description: z.string(),
  // * features.reasoning_config duplicates the top-level field on every model (verified);
  // * only chat_template_config carries occasional signal and is lifted out
  features: z
    .strictObject({
      chat_template_config: z.record(z.string(), z.unknown()).optional(),
      reasoning_config: z.unknown().optional(),
    })
    .nullable(),
  group: z.string(),
  has_text_output: z.boolean(),
  hf_slug: z.string().nullable(),
  // * null on every model observed so far — nothing to model yet
  hf_updated_at: z.null(),
  // * always false in a public capture; hidden/private models never reach this API
  hidden: z.boolean(),
  input_modalities: z.array(z.string()),
  instruct_type: z.string().nullable(),
  is_private: z.boolean(),
  // * null on every model observed so far — nothing to model yet
  is_trainable_image: z.null(),
  // * only true/null observed — normalized to a plain boolean
  is_trainable_text: z.boolean().nullable(),
  knowledge_cutoff: z.string().nullable(),
  limit_rpd: z.number().nullable(),
  limit_rpm: z.number().nullable(),
  model_version_group_id: z.string().nullable(),
  name: z.string(),
  output_modalities: z.array(z.string()),
  permaslug: z.string(),
  // * appeared upstream between 2026-07-24 and 2026-07-25; null on every model observed so far
  preview_audio: z.null(),
  // * null on every model observed so far — nothing to model yet
  preview_thumbnail_url: z.null(),
  // * OR marketing copy — not a model fact
  promotion_message: z.string().nullable(),
  // * OR docs-UI hint — not a model fact
  quick_start_example_type: z.string().nullable(),
  reasoning_config: ReasoningConfig.nullable(),
  // * empty array on every model observed so far — nothing to model yet
  required_attestation_types: z.array(z.string()),
  // * null on every model observed so far — nothing to model yet
  router: z.null(),
  routing_error_message: z.string().nullable(),
  short_name: z.string(),
  slug: z.string(),
  supported_tts_voices: z.array(z.string()).nullable(),
  supports_reasoning: z.boolean(),
  updated_at: z.string(),
  warning_message: z.string().nullable(),
})

// * canonical model: flat and snake_cased for SQL storage, one row per base model slug
// * (variants live on scopes/endpoints, and every embedded copy of a model is identical
// * across its variants — verified). permaslug is the versioned identity.
export const Model = z.strictObject({
  author: z.string(),
  author_display_name: z.string(),
  // * only observed value is should_hoist_and_merge_system_messages; null when empty
  chat_template_config: z.record(z.string(), z.unknown()).nullable(),
  context_length: z.number(),
  created_at: z.string(),
  // * OR's provider routing preference order — changes are Monitor-worthy signal
  default_order: z.array(z.string()),
  // * only non-null sampling defaults are kept; null when the model sets none
  default_parameters: z.record(z.string(), z.number()).nullable(),
  default_stops: z.array(z.string()),
  default_system: z.string().nullable(),
  description: z.string(),
  group: z.string(),
  has_text_output: z.boolean(),
  hf_slug: z.string().nullable(),
  input_modalities: z.array(z.string()),
  instruct_type: z.string().nullable(),
  is_trainable_text: z.boolean(),
  knowledge_cutoff: z.string().nullable(),
  limit_rpd: z.number().nullable(),
  limit_rpm: z.number().nullable(),
  model_version_group_id: z.string().nullable(),
  name: z.string(),
  output_modalities: z.array(z.string()),
  permaslug: z.string(),
  reasoning_config: ReasoningConfig.nullable(),
  routing_error_message: z.string().nullable(),
  short_name: z.string(),
  slug: z.string(),
  supported_tts_voices: z.array(z.string()),
  supports_reasoning: z.boolean(),
  updated_at: z.string(),
  warning_message: z.string().nullable(),
})
export type Model = z.infer<typeof Model>

// * input is one embedded model copy per scope; variants of the same model repeat the copy
export function canonicalizeModels(raws: unknown[]): Model[] {
  const models = new Map<string, Model>()
  for (const raw of raws) {
    const m = RawModel.parse(raw)

    // * drop null-valued sampling defaults; treat an all-null object as "none set"
    const defaults: Record<string, number> = {}
    for (const [key, value] of Object.entries(m.default_parameters)) {
      if (value !== null) {
        defaults[key] = value
      }
    }

    const chatTemplateConfig = m.features?.chat_template_config
    const model = Model.parse({
      author: m.author,
      author_display_name: m.author_display_name,
      chat_template_config:
        chatTemplateConfig && Object.keys(chatTemplateConfig).length > 0
          ? chatTemplateConfig
          : null,
      context_length: m.context_length,
      created_at: m.created_at,
      default_order: m.default_order,
      default_parameters: Object.keys(defaults).length > 0 ? defaults : null,
      default_stops: m.default_stops,
      default_system: m.default_system,
      description: m.description,
      group: m.group,
      has_text_output: m.has_text_output,
      hf_slug: emptyToNull(m.hf_slug),
      input_modalities: m.input_modalities,
      instruct_type: m.instruct_type,
      is_trainable_text: m.is_trainable_text === true,
      knowledge_cutoff: m.knowledge_cutoff,
      limit_rpd: m.limit_rpd,
      limit_rpm: m.limit_rpm,
      model_version_group_id: m.model_version_group_id,
      name: m.name,
      output_modalities: m.output_modalities,
      permaslug: m.permaslug,
      reasoning_config: m.reasoning_config,
      routing_error_message: emptyToNull(m.routing_error_message),
      short_name: m.short_name,
      slug: m.slug,
      supported_tts_voices: m.supported_tts_voices ?? [],
      supports_reasoning: m.supports_reasoning,
      updated_at: m.updated_at,
      warning_message: emptyToNull(m.warning_message),
    })

    // * variants must carry identical model copies — a divergence means our "one row per
    // * slug" premise broke and we want to hear about it immediately
    const existing = models.get(model.slug)
    if (existing && JSON.stringify(existing) !== JSON.stringify(model)) {
      throw new Error(`divergent model copies for slug ${model.slug}`)
    }
    models.set(model.slug, model)
  }
  return [...models.values()].toSorted((a, b) => a.slug.localeCompare(b.slug))
}
