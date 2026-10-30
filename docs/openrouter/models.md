# Model fields

A model record describes a model independently of any particular provider endpoint.

This is the central inventory of currently observed model fields. Names match the upstream
payload. Fields that have no established semantics are intentionally left without speculation.
Unless stated otherwise, 📊 counts are from text-input, text-output models with endpoints: 442 on 2026-10-24,
and monthly samples since 2025-08-14.

## Identity and presentation

- `slug` — current model identifier.
- `permaslug` — versioned model identifier; it can equal `slug`.
- `name`
- `short_name`
- `author` — author slug.
- `author_display_name`
- `description` — a substantive string in every sample; never null or blank.
- `group` — 🚫 family label such as `GPT`, `Gemini`, or `Claude`; 145 of 439 models were `Other` on 2026-10-23.
- `hf_slug` — ⚠️ both `""` and `null` have represented absence.
- `model_version_group_id` — 🚫 ❓ sparse opaque identifier; 88 models in 25 groups on 2026-10-23.

Known differences between the first `slug` segment and `author` include `deepseek` → `deepseek-ai`
and `cognitivecomputations` → `venice`.

## Modalities and capabilities

- `input_modalities`
- `output_modalities`
- `has_text_output`
- `context_length` — 🔄 matches that of the current top endpoint.
- `instruct_type` — 💤
- `knowledge_cutoff`
- `supports_reasoning`
- `reasoning_config`
- `supported_tts_voices` — null or empty on every text model.
- `is_trainable_text` — 💤
- `is_trainable_image` — 💤 null in every sample.
- `features`
- `features.chat_template_config` — the observed substantive key is `should_hoist_and_merge_system_messages`.
- `features.reasoning_config` — ⚠️ observed to duplicate top-level `reasoning_config` exactly.

### `reasoning_config`

Key presence varies by model. Values can also be `null`.

- `default_reasoning_effort`
- `default_reasoning_enabled`
- `end_token`
- `is_mandatory_reasoning`
- `reasoning_return_mechanism`
- `start_token`
- `supported_reasoning_efforts`
- `supports_reasoning_effort`
- `supports_reasoning_max_tokens`
- `system_prompt`

### Public reasoning discovery

The reasoning guide checked on 2026-10-23 documents a separate public-model `reasoning` object,
including `supported_efforts`, `default_effort`, `default_enabled`, `supports_max_tokens`, and `mandatory`.
An omitted `supported_efforts` means effort selection is unavailable; explicit `null` accepts all
gateway effort levels, and an array enumerates them in descending effort order. This meaning
belongs to that public field; it does not establish the meaning of null in frontend `reasoning_config`.
On most providers, reasoning and visible output share the request's output-token budget.

Source: `https://openrouter.ai/docs/guides/best-practices/reasoning-tokens`.

## Defaults and routing

- `default_order` — 🚫 ⚠️ ordered provider-routing preference; order is part of the value.
- `default_parameters` — values may be `null`.
- `default_stops`
- `default_system`
- `router` — 💤 null in every sample.

## Limits

- `limit_rpm` — 🚫 does not describe endpoint limits; nonzero only on GLM 5.3 Flash and Gemini Flash, 2026-10-28.
- `limit_rpd` — 🚫 does not describe endpoint limits.

## Messages and OpenRouter presentation

⚠️ `warning_message`, `promotion_message`, and `routing_error_message` have each used both `""` and
`null` for absence. Whitespace-only strings also occur in `reasoning_config.system_prompt`.

- `warning_message` — provider guidance; texts include data-logging terms for free endpoints.
- `promotion_message` — 🚫 OpenRouter promotional copy rather than a model fact; substantive in 2 sampled records.
- `routing_error_message` — 🚫 ⚠️ often misattributed; see below.
- `quick_start_example_type` — 💤
- `preview_audio` — 💤 null in every sample.
- `preview_thumbnail_url` — 💤
- `required_attestation_types` — 💤

📊 `routing_error_message` was nonempty on 7 models with endpoints on 2026-10-24, and none of those
endpoints was disabled. Five messages describe a retired `:free` sibling but appear on the paid model,
such as `minimax/minimax-m3.1-flash`. `anthropic/claude-fable-5` and its batch variant reported
unavailability while listing 7 enabled endpoints.

## Visibility

- `hidden` — 🚫 ⚠️ `false` in every sample; public data cannot establish hidden-model behavior.
- `is_private` — 🚫 ⚠️ `false` in every sample; public data cannot establish private-model behavior.

## Timestamps

- `created_at`
- `updated_at` — ⚠️ 89 of 439 models shared `2026-03-24T19:43:16.801Z` on 2026-10-23.
- `variant_deprecation_date` — variant-level counterpart of endpoint `deprecation_date`, with the same placeholders.
- `hf_updated_at` — 💤 null in every sample.
