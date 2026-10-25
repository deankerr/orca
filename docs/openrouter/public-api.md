# Public endpoint API

OpenRouter's public `GET https://openrouter.ai/api/v1/models/{author}/{slug}/endpoints` lists one model
variant's endpoints. It is a reduced, partly derived view of the same offerings as the frontend catalog.
ORCA scans the frontend catalog; the public API is a comparison and enrichment source only.

## Retrieving a response

Fetch the current response when a question depends on public values; values change frequently.

```sh
curl -s https://openrouter.ai/api/v1/models/moonshotai/kimi-k3/endpoints | jq '.data.endpoints[0]'
```

- The path takes the model ID verbatim, including a `:variant` suffix.
- The `data` wrapper carries model `id`, `name`, `created`, `description`, and `architecture`, plus `endpoints`.
- Anonymous requests return null `latency_last_30m` and `throughput_last_30m`; a bearer API key populates them.
- Record the capture time beside any retained values; one response does not establish catalog-wide behavior.

Fields observed on every endpoint on 2026-10-25: `name`, `model_id`, `model_name`, `context_length`,
`pricing`, `provider_name`, `tag`, `service_tier`, `quantization`, `max_completion_tokens`,
`max_prompt_tokens`, `supported_parameters`, `supports_tool_choice`, `status`, `uptime_last_5m`,
`uptime_last_30m`, `uptime_last_1d`, `supports_implicit_caching`, `native_tools`,
`supports_voice_cloning`, `supports_multiple_audio_references`, `supports_image_reference`,
`supports_diarization`, `latency_last_30m`, and `throughput_last_30m`.

## Differences from frontend values

📊 A 2026-10-23 comparison matched 245 public endpoints across 16 models with frontend values by model ID
and provider tag. Membership, `context_length`, `max_prompt_tokens`, `quantization`, meter rates,
`discount`, and `overrides` agreed, apart from the derivations below.

### `max_completion_tokens`

The public API fills an unset output limit with a fraction of `context_length` and caps larger values to it.

| Outcome against the frontend value             | Endpoints |
| ---------------------------------------------- | --------: |
| Equal                                          |       121 |
| Public 0.9 × context; frontend above that cap  |        78 |
| Public 0.9 × context; frontend null            |        42 |
| Public 0.8 × context, `mistralai/mistral-nemo` |         4 |

- Public values never exceeded frontend values; 0.9 held on the other 11 models with differences.
- 🔄 A 2026-08-25 sample reported null and full-context values, so the derivation is recent.
- ❓ Undocumented; whether the fraction depends on model, provider, or context size is unknown.

### Other derivations

The public `supported_parameters` adds `reasoning_effort` wherever `reasoning` is supported and the
model has `reasoning_config.supported_reasoning_efforts`; frontend lists carry it on few endpoints.

Public `provider_name` is one short name per provider, such as `Google` for `google-vertex`.
Frontend `provider_display_name` is an endpoint label that varies across a provider's endpoints.

Repeating-decimal rates carry 15 significant digits against the frontend's 16, for example
`0.0000000833333333333333` against `0.00000008333333333333334`. Neither establishes the exact rate.

Public `supports_implicit_caching` reports `true` and `false`, clustered by provider. Frontend scans
only ever held `true` and dropped the key in October 2026. ❓ The public value's source is unknown.

## Public-only fields

- `supports_tool_choice` exposes `none`, `auto`, `required`, and `function` modes.
- `native_tools` maps canonical `openrouter:*` names, such as `openrouter:web_search`, to provider tool names.
- `supports_voice_cloning`, `supports_multiple_audio_references`, and `supports_diarization` are audio flags. 💤
- `supports_image_reference` is an image flag. 💤
- Authenticated responses add `perf_last_30m_by_workload`; only the `text_generation` workload was observed.

Each workload holds `latency`, `throughput`, and `request_count`. Latency and throughput objects
hold `p50`, `p75`, `p90`, and `p99`. Throughput percentiles descend, following the percentile
definition in `telemetry.md`; a 2026-08-25 sample had ascending throughput.

## Uptime and status

🚫 `uptime_last_5m`, `uptime_last_30m`, and `uptime_last_1d` are percentages. OpenRouter's provider guide
defines uptime as successful requests over total requests, excluding user errors, from 100 requests:

| Counted as failure                                                         | Excluded                          |
| -------------------------------------------------------------------------- | --------------------------------- |
| 401, 402, 404, setup errors (405, 408, 410, 421, 423, 424, 426, 498), 500+ | 400 and 413, as user input errors |
| Mid-stream errors and successful responses with error finish reasons       | 429 and 403, tracked separately   |

Routing treats 95% and above as normal, 80–94% as degraded, and below 80% as fallback only.
⚠️ Rate limiting, provider errors returned as 400, garbled output, and failed tool calls with a normal
finish reason do not reduce uptime. Experienced OpenRouter users widely regard it as misleading.

`status` is numeric; observed values are 0, −2, −3, and −5. ❓ Negative codes are undocumented; −5
coincided with lower uptime than −2 in the 2026-10-23 comparison, without a threshold relationship.

Source checked 2026-10-25: `https://openrouter.ai/docs/guides/community/for-providers.md`.
