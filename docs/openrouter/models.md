# Model fields

A model record describes a model independently of any particular provider endpoint.

This is the central inventory of currently observed model fields. Names match the upstream
payload. Fields that have no established semantics are intentionally left without speculation.

## Identity and presentation

- `slug` — current model identifier.
- `permaslug` — versioned model identifier; it can equal `slug`.
- `name`
- `short_name`
- `author` — author slug. It normally matches the first segment of `slug`.
- `author_display_name`
- `description`
- `group` — ❓ exact grouping semantics are unconfirmed.
- `hf_slug` — ⚠️ both `""` and `null` have represented absence.
- `model_version_group_id` — ❓ sparse opaque identifier; exact semantics are unknown.

## Modalities and capabilities

- `input_modalities`
- `output_modalities`
- `has_text_output`
- `context_length` — 🔄 matches that of the current top endpoint.
- `instruct_type`
- `knowledge_cutoff`
- `supports_reasoning`
- `reasoning_config`
- `supported_tts_voices` — ⚠️ meaningful for speech models.
- `is_trainable_text` — 📌 observed only as `true` or `null` in the 2026-07 corpus.
- `is_trainable_image` — 📌 observed only as `null` in the 2026-07 corpus.
- `features`
- `features.chat_template_config` — 📌 the observed substantive key is
  `should_hoist_and_merge_system_messages`.
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

## Defaults and routing

- `default_order` — ⚠️ ordered provider-routing preference; order is part of the value.
- `default_parameters` — values may be `null`.
- `default_stops`
- `default_system`
- `router` — 📌 observed only as `null` in the 2026-07 corpus.

## Limits

- `limit_rpm` — ❓ zero has been observed; its meaning is unknown.
- `limit_rpd` — ❓ zero has been observed; its meaning is unknown.

## Messages and OpenRouter presentation

⚠️ `warning_message`, `promotion_message`, and `routing_error_message` have each used both `""` and
`null` for absence.

- `warning_message`
- `promotion_message` — OpenRouter promotional copy rather than a model property.
- `routing_error_message`
- `quick_start_example_type` — OpenRouter documentation-UI hint.
- `preview_audio` — 📌 observed only as `null` in the initial July 2026 observations.
- `preview_thumbnail_url` — 📌 observed only as `null` in the 2026-07 corpus.
- `required_attestation_types` — 📌 observed only as an empty array in the 2026-07 corpus.

## Visibility

- `hidden` — ⚠️ observed as `false` in public captures; public data cannot establish hidden-model
  behavior.
- `is_private` — ⚠️ observed as `false` in public captures; public data cannot establish private-model
  behavior.

## Timestamps

- `created_at`
- `updated_at`
- `hf_updated_at` — 📌 observed only as `null` in the 2026-07 corpus.
