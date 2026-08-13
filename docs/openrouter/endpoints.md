# Endpoint fields

An endpoint is one provider configuration offering one model variant.

This is the central inventory of currently observed endpoint fields. Names match the upstream
payload. Fields that have no established semantics are intentionally left without speculation.

## Identity

- `id` — 📌 opaque UUID, observed to be globally unique and stable for an endpoint's lifetime.
  ⚠️ A recreated offering can receive a new UUID.
- `name` — ⚠️ derivable as `${provider_name} | ${model_variant_permaslug}` in the 2026-07-24 corpus.
  It is human-readable but not a safe primary key; a historical collision is known.
- `model_variant_slug`
- `model_variant_permaslug`
- `variant`
- `created_at`

## Provider relationship

⚠️ These are endpoint properties. They are not reliable denormalized attributes of the embedded
provider record.

- `provider_name` — 📌 the only observed orphan-free endpoint-to-provider grouping.
- `provider_slug` — ⚠️ endpoint targeting key, exposed as `tag` in the end-user API; not a reliable
  provider-record foreign key.
- `provider_display_name`
- `provider_model_id` — provider's own model identifier for this endpoint.
- `provider_region`
- `adapter_name` — OpenRouter-internal adapter wiring rather than an endpoint capability.

## Serving shape and limits

- `context_length`
- `max_prompt_tokens`
- `max_completion_tokens`
- `max_tokens_per_image`
- `capacity_tpm`
- `limit_rpm`
- `limit_rpd`
- `limit_rpm_cf` — 📌 observed only as `null` in the 2026-07 corpus.
- `quantization`

## Protocol and capabilities

- `has_chat_completions`
- `has_completions`
- `can_abort`
- `supports_reasoning`
- `supports_multipart`
- `supports_tool_parameters`
- `moderation_required`
- `supported_parameters` — ⚠️ contains LLM-shaped boilerplate outside text modalities.
- `excluded_parameters`
- `allowed_passthrough_parameters` — provider-specific parameters that may pass through unchanged;
  especially meaningful for image and video styling.
- `supported_image_parameters` — ⚠️ interpretation depends on modality.
- `supported_video_parameters` — ⚠️ interpretation depends on modality and the field also occurs on
  non-video endpoints.
- `features` — ⚠️ capability flags include cross-modality boilerplate.

### `features`

Feature-key presence varies by endpoint.

- `disable_free_endpoint_limits`
- `is_mandatory_reasoning`
- `reasoning_return_mechanism`
- `should_send_reasoning_text_in_text_content`
- `supported_parameters` — ⚠️ map of names to booleans; distinct from the
  top-level array of the same name.
- `supports_base64_file_input`
- `supports_base64_video_input`
- `supports_file_urls`
- `supports_implicit_caching`
- `supports_input_audio`
- `supports_multipart`
- `supports_native_apply_patch`
- `supports_native_web_fetch`
- `supports_native_web_search`
- `supports_tool_choice` — ⚠️ universal in the 2026-07-24 observation, including non-text endpoints;
  contains `literal_auto`, `literal_none`, `literal_required`, and `type_function`.
- `supports_video_urls`

## Commercial and operational state

- `is_free`
- `is_byok`
- `is_byok_only`
- `is_deranked`
- `is_disabled`
- `is_hidden` — ⚠️ observed as `false` in public captures.
- `is_private` — ⚠️ observed as `false` in public captures.
- `deprecation_date`
- `status` — 🔄 volatile routing penalty despite its placement on the endpoint record. ⚠️ This should now probably be considered telemetry.

## Data policy

⚠️ Endpoint policy is authoritative for behavioral claims; provider policy can be overridden.

- `data_policy`
- `data_policy.canPublish`
- `data_policy.retainsPrompts`
- `data_policy.retentionDays`
- `data_policy.requiresUserIDs`
- `data_policy.training`
- `data_policy.trainingOpenRouter`
- `data_policy.privacyPolicyURL`
- `data_policy.termsOfServiceURL`

## Pricing

- `pricing_json`
- `pricing`
- `display_pricing`
- `pricing_version_id`
- `tiers`

## Telemetry

🔄 These values change independently of durable endpoint configuration.

- `stats`
- `statsByTier`
- `routing_heuristics_by_tier`
- `status_heuristics`
- `status_heuristics_1d`
- `status_heuristics_5m`

## Embedded records

⚠️ These are repeated denormalized copies, not additional entities.

- `model`
- `provider_info`
