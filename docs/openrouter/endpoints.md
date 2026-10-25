# Endpoint fields

An endpoint is one provider configuration offering one model variant.

This is the central inventory of currently observed endpoint fields. Names match the upstream
payload. Fields that have no established semantics are intentionally left without speculation.
Unless stated otherwise, 📊 counts are from the 2026-10-24 scan's text-input, text-output scope:
1,472 endpoints. Historical counts are from samples near the start of each month since 2025-08-14.

## Identity

- `id` — opaque UUID, observed to be globally unique and stable for an endpoint's lifetime.
- `name` — `${provider_name} | ${model_variant_permaslug}`; a historical collision is known.
- `model_variant_slug`
- `model_variant_permaslug`
- `variant`
- `created_at` — ⚠️ not always first offering: 23 endpoints on 2026-10-23 shared `2026-04-28T20:44:52.471Z`.

An endpoint UUID can retain its identity across model, provider, and tag changes, including moves
between standard and `:free` model variants. Retained listing history through September 26, 2026
establishes these transitions in `endpoint-identity-changes.md`.

## Provider relationship

⚠️ These are endpoint properties. They are not reliable denormalized attributes of the embedded
provider record.

- `provider_name` — observed values include `Anthropic` and `Google`.
- `provider_slug` — targeting key exposed as `tag` in the public API, e.g. `anthropic`, `google/global`.
- `provider_display_name` — endpoint label; labels do not follow tags and can vary across a provider's endpoints.
- `provider_model_id` — 💤 provider's own model identifier for this endpoint.
- `provider_region` — mixes broad labels (`us`, `global`, `eu`) and cloud regions (`us-east-1`, `eastus2`).
- `declared_region` — 💤 null in every sample.
- `adapter_name` — 🚫 OpenRouter-internal adapter wiring rather than an endpoint capability.

A reported region does not establish execution or storage residency.

## Service tiers

Public `service_tier` values are `priority`, `flex`, and `ultrafast`, with `null` for standard
endpoints. Tier offerings are distinct endpoints with their own prices and tag suffixes, such as
`google-ai-studio/flex` and `google-vertex/global/priority`.

- `service_tier` — the explicit tier; labels and tag substrings should not substitute for it.
- `derived_service_tier` — provider-facing priority label: `fast`, `highspeed`, `prime`, or `turbo`.

📊 Before 2026-08-26, tier pricing and stats were nested on the standard endpoint as `tiers` and
`statsByTier`, keyed `flex` and `priority`. Separate tier endpoints with `service_tier` appeared
from 2026-08-26 and replaced both nested fields between the 2026-08-31T12:30 and 2026-09-01T00:30
scans. On 2026-09-01, `google/gemini-2.5-flash` on `google-ai-studio` quoted prompt tokens at
0.5× standard for flex and 1.8× for priority. `derived_service_tier` was absent on 2026-10-01 and
present by 2026-10-23; on 2026-10-24 it labelled 20 of the 43 priority endpoints whose tags carry
`fast`, `highspeed`, `turbo`, or `prime` suffixes.

The service-tiers guide, checked 2026-10-23, describes provider-facing labels including Fast,
Turbo, Highspeed, and Prime: `https://openrouter.ai/docs/guides/features/service-tiers`.

## Serving shape and limits

- `context_length`
- `max_prompt_tokens`
- `max_completion_tokens` — null on 197 endpoints; the public API fills null with a fraction of context.
- `max_tokens_per_image`
- `limit_rpm`
- `limit_rpd`
- `limit_rpm_cf` — 🚫 null in every sample.
- `capacity_tpm` — 🚫 🔄 likely provider-side traffic advice or a limit; 79 values from 1 to 19,568,000,000 on 2026-10-23.
- `quantization` — the string `unknown` is OpenRouter's explicit report that quantization is unknown.

📊 Removed: `max_prompt_images` last carried values in the 2025-11-01 sample and was absent by 2025-12-01.

## Protocol and capabilities

- `has_chat_completions`
- `has_completions`
- `can_abort`
- `supports_reasoning`
- `supports_multipart`
- `supports_tool_parameters`
- `moderation_required`
- `supported_parameters` — ⚠️ contains LLM-shaped boilerplate outside text modalities.
- `excluded_parameters` — 🚫 never overlaps `supported_parameters`; most often `top_p`, `temperature`, `top_k`.
- `allowed_passthrough_parameters` — provider-specific parameters, including image and video styling.
- `supported_image_parameters` — ⚠️ interpretation depends on modality.
- `supported_video_parameters` — ⚠️ interpretation depends on modality and the field also occurs on non-video endpoints.
- `supported_stt_parameters` — null on every text endpoint.
- `features` — ⚠️ capability flags include cross-modality boilerplate.

### Public native-tool discovery

OpenRouter's server-tools guide describes endpoint `native_tools` as a mapping from canonical
`openrouter:*` tool names to provider tool names. Native capability is distinct from generic
function calling or an OpenRouter-executed server tool. Native Bash support does not establish
provider-side execution: the guide documents a client-execution exception.

Source checked 2026-10-23: `https://openrouter.ai/docs/guides/features/server-tools`.

### `features`

Feature-key presence varies by endpoint.

- `disable_free_endpoint_limits`
- `is_mandatory_reasoning` — can differ from the model's `reasoning_config`; see below.
- `reasoning_return_mechanism`
- `should_send_reasoning_text_in_text_content`
- `supported_parameters` — 🚫 ⚠️ contradicts the endpoint `supported_parameters` array in both directions.
- `supports_base64_file_input` — 🚫
- `supports_base64_video_input` — 🚫
- `supports_file_urls` — 🚫
- `supports_input_audio` — 🚫
- `supports_multipart`
- `supports_native_apply_patch` — only ever `true` when present.
- `supports_native_web_fetch` — only ever `true` when present.
- `supports_native_web_search`
- `supports_tool_choice` — contains `literal_auto`, `literal_none`, `literal_required`, and `type_function`.
- `supports_video_urls` — 🚫

📊 Removed: `supports_implicit_caching` disappeared from all 115 endpoints carrying it between the
2026-10-13 and 2026-10-14 daily samples, without a replacement key. It had only ever held `true`.

❓ File, video, and audio input flags may describe how OpenRouter delivers input to the provider
rather than what a caller can send; OpenRouter may translate between forms. `features.*` values,
including `supported_parameters`, may likewise be internal routing inputs. Neither is established.

⚠️ `supports_tool_choice` is boilerplate without tools: 134 of 142 endpoints lacking `tools` in
`supported_parameters` report all four modes. Of endpoints listing `tools` and `tool_choice`, 884
support all four modes, 197 lack `required` and function selection, and 98 support only `auto`.

`features.supported_parameters` disagreements: `structured_outputs` is `false` on 12 endpoints listing
it and `true` on 1 without it; `response_format` is `false` on 6 listing it and `true` on 3 without it.

Endpoint `is_mandatory_reasoning` against the model's `reasoning_config.is_mandatory_reasoning`:

| Endpoint value | Model `true` | Model `false` | Model null | Model absent |
| -------------- | -----------: | ------------: | ---------: | -----------: |
| `true`         |           81 |             5 |            |              |
| `false`        |              |             1 |            |           16 |
| Absent         |          344 |           486 |          8 |          529 |

## Commercial and operational state

- `is_free`
- `is_byok` — 💤 `false` in every sample.
- `is_byok_only` — the endpoint cannot be used with OpenRouter credits.
- `is_deranked`
- `is_disabled`
- `is_hidden` — 🚫 `false` in every sample.
- `is_private` — 🚫 `false` in every sample.
- `is_hipaa_eligible` — 💤 `false` on every endpoint since it first appeared, by 2026-09-01.
- `is_pricing_unresolved` — 💤 `false` in every sample.
- `deprecation_date`

Constant values in public scans do not establish how private, hidden, or enterprise offerings behave.

📊 `is_byok_only` is true on 38 endpoints: 32 `:batch` endpoints (`openai` 22, `anthropic` 10) and 6 standard.

📊 Deprecation dates predict removal. Sampled history held 181 endpoint/date pairs that passed by
2026-10-24; 177 of those endpoints were then absent. Dates can move later: `google/gemini-2.0-flash-001`
on `google-ai-studio` moved from 2026-03-31 to 2026-06-01. Far-future values are placeholders:
`2098-12-31T16:00:00.000Z` on `z-ai` models since July 2026, and `9999-01-01T13:00:00.000Z` once on `poolside`.

## Data policy

- `data_policy`
- `data_policy.canPublish`
- `data_policy.retainsPrompts`
- `data_policy.retentionDays`
- `data_policy.requiresUserIDs`
- `data_policy.safetyRetention` — true on 58 endpoints on 2026-10-23; `false` on embedded provider copies.
- `data_policy.training`
- `data_policy.trainingOpenRouter`
- `data_policy.privacyPolicyURL`
- `data_policy.termsOfServiceURL`
