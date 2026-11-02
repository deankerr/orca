# Scan study: endpoint properties

Which endpoint facts, apart from identity, pricing, and stats, could be shown as compact properties? How often does each one hold?

This study keeps its input scan so that later questions can reuse the same population.

## Scope

- Input: production scan `2026-10-27T23:40:40.374Z`, the latest stored scan when collected on 2026-10-28 through the read-only object API. Provenance is in `source.csv`.
- The scan is retained as `scan.2026-10-27T23:40:40.374Z.jsonl.gz`. It is upstream OpenRouter frontend data, one model per line, collected before ORCA's extraction. It contains no credentials or ORCA user data.
- Population: ORCA's extraction scope, meaning text-input, text-output models that have endpoints, excluding Lyria. That gives 1,484 endpoints across 435 models, 83 ORCA providers, and 244 provider tags.
- 198 models have two or more endpoints; together they hold 1,247 endpoints.
- The collected scan also holds 266 endpoints outside that scope (image, video, speech, embeddings and similar).

### Counting rules

- A model fact counts as a fact of each of the model's endpoints. Model `limit_rpm` and `limit_rpd` are ignored (see Inheritance).
- A missing or null boolean counts as false, and a missing or null value counts as inactive.
- `provider_info` fields that the endpoint also carries are ignored. Provider-only fields apply to all of that provider's endpoints.
- The nested `model.endpoint` copy is ignored.
- Deprecation dates after 2090 are treated as placeholders. "New" means created within 30 days of the scan.

## Files

- `listing.csv`: the provisional property listing from `listing.py`, 81 properties with display name, entity, group, polarity, kind, frequencies, source rule, hover description, and notes. See [Provisional listing](#provisional-listing).
- `properties.csv`: 167 candidate properties, each with its source, endpoint, model and provider counts, binary entropy, the number of multi-endpoint models where it varies, and its values.
  - Groups: modality, reasoning, tools, native tools, input delivery, protocol, data policy, limits, commercial, status, facet, model facts, provider, and pricing-derived.
  - Each parameter list is expanded to one row per member: supported, excluded, passthrough, and reasoning effort.
- `fields.csv`: every leaf path in scope, with a disposition (property, identity, pricing, stats, dimension, duplicate, provider duplicate, modality detail, presentation, internal, constant, link, or container) and value counts.
- `agreements.csv`: joint value counts for facts that are stated in more than one place.
- `providers.csv`: provider-only `provider_info` facts per ORCA provider.
- `population.csv` and `source.csv`: denominators, hashes, and provenance.

## Observations

### Constant fields

These carry no information in this scope:

- Always false: `is_byok`, `is_hidden`, `is_private`, `is_hipaa_eligible`, `is_pricing_unresolved`, `is_disabled`, `canPublish`, and `sendClientIp`.
- Always empty: `requiredAttestationTypes`.
- True everywhere: chat completions, text input, and text output.

### Rare properties that matter when present

| Property                                   | Endpoints |
| ------------------------------------------ | --------: |
| deranked                                   |         9 |
| deprecation date                           |        29 |
| BYOK-only                                  |        37 |
| `training`                                 |        16 |
| `trainingOpenRouter`                       |         7 |
| `limit_rpd`                                |         4 |
| `max_tokens_per_image`                     |         2 |
| hidden reasoning (return mechanism `none`) |         3 |
| `prediction`                               |        10 |
| `top_a`                                    |        11 |
| `web_search_options`                       |        22 |

### Inheritance

- Inheriting model facts changes few counts. Reasoning gains one endpoint, which reports `false` under a reasoning model.
- Mandatory reasoning rises from 86 endpoint flags to 434 endpoints, because 348 of them carry it only at model level.
- Model `limit_rpm` is nonzero for two model families only:
  - 50,000 on `z-ai/glm-5.3-flash` and its batch variant, covering 40 endpoints across providers.
  - 300 on Gemini 3.7 and 3.8 Flash.
- Six GLM endpoints state their own lower limit. Including model limits would raise rate-limited endpoints from 137 to 187.
- Model limits are ignored from 2026-10-28: nonzero values are not seen elsewhere and do not describe endpoint limits. `properties.csv` counts endpoint limits only; `agreements.csv` keeps the joint counts.

### Duplicated and undocumented fields

- `is_zdr` equals `not retainsPrompts` on all 1,484 endpoints (952 ZDR).
  - Only 33 of those 952 have `zdr` in their tag; every tagged endpoint is ZDR.
- `status` is undocumented:
  - `-3` matches `is_deranked` exactly (9 endpoints).
  - `-2` (30) and `-5` (37) cover enabled endpoints with higher median p50 latency: 1.3 s and 4.2 s, against 1.1 s for status 0.
  - Their meaning is not established.

### Provider-driven properties

- `can_abort` is false on 481 endpoints (32%). This follows the provider: Vertex, Bedrock, Mistral, AI Studio, Alibaba and SiliconFlow are the largest.
- Temperature is excluded on 289 endpoints and `top_p` on 298. The providers are `openai`, `azure`, `google-vertex`, `amazon-bedrock`, `anthropic` and `claude-on-aws`.
  - 30 endpoints neither list nor exclude temperature.
- Azure excludes `max_tokens` on all 79 of its endpoints.

### Tools and native tools

- Of 1,345 tool-calling endpoints, 986 accept `tool_choice: required`. 432 lack at least one of the four modes; 97 accept only `auto`.
- Native tools:
  - Web search: 341 endpoints (10 providers).
  - Apply patch: 176 (2 providers).
  - Web fetch: 28 (3 providers).
- A web-search price appears on 490 endpoints, so it does not imply native support.

### Reasoning and modalities

- Reasoning detail:
  - Effort levels are listed on 886 endpoints and a default effort on 779.
  - Reasoning is off by default on 113.
  - A max-tokens budget is supported on 23.
- Input modalities: image 983, file 517, video 363, audio 122.
- Output modalities: image 15, audio 2.

### Limits

| Property                                         | Endpoints |
| ------------------------------------------------ | --------: |
| `max_completion_tokens` null                     |       204 |
| `max_prompt_tokens` below context                |       147 |
| `capacity_tpm`                                   |        80 |
| Context shorter than the widest sibling endpoint |       230 |

### Provider-only facts

- Every provider-only fact is consistent within each provider. The exception is the internal `pricingStrategy`.
- `headquarters` is set for 65 of 83 providers. By endpoint: US 1,117, SG 124, FR 53, CN 45.
- `datacenters` is set for 23 providers.
- `byokEnabled` is false for 15 providers.

### Model facts

- Open weights (`hf_slug` present): 176 models, 872 endpoints.
- Knowledge cutoff: 159 models.
- `is_trainable_text`: 107 models. Its meaning is not established.
- `warning_message` appears on 20 models. Some messages describe a single endpoint, for example Bedrock being BYOK-only on Claude Fable.

### Variation within models

- Among endpoints of the same model, these vary most often: region (148 models), ZDR and retention (132), completions (125), abortable (92), and quantization (81).
- Model-level facts never vary within a model, by construction.

### Pricing-derived candidates

These are kept for discussion:

| Property                 | Endpoints |
| ------------------------ | --------: |
| caching                  |     1,214 |
| cache write              |       342 |
| long-context pricing     |       233 |
| discount                 |       128 |
| reasoning price          |        91 |
| scheduled (peak) pricing |        10 |

## Provisional listing

`listing.csv` takes a welcoming stance: it lists every property worth choosing from, and display placement is decided separately.

- Entity is where the fact belongs: `model` facts apply to all the model's endpoints, and `provider` facts to all the provider's endpoints.
- Polarity is positive, neutral, or negative. A property is named for its notable state, so `No Abort` is active when `can_abort` is false.
- `kind` is `value` when the property carries values, else `flag`. `models_varying` counts multi-endpoint models whose endpoints disagree.
- Pricing-derived properties are included even where the price list makes them obvious, because they serve filters.
- Supported parameters are listed individually as candidates for a dedicated parameter filter. `parallel_tool_calls` sits with tools, and `prediction`, `logprobs`, `verbosity`, and `web_search_options` sit with output control.

Considered and left out on 2026-10-28:

- `status`: too volatile.
- Model `limit_rpm` and `limit_rpd`: see Inheritance.
- Multipart, `capacity_tpm`, excluded parameters (including fixed sampling), and reasoning pricing.
- `features.supports_*` input-delivery flags: they may describe delivery to the provider rather than caller input.
- `is_trainable_text`, `instruct_type`, `default_stops`, `default_system`, and `routing_error_message`: their meanings are unclear, or they are misattributed or one-offs.
- `include_reasoning` and `reasoning` parameters, and `supports_tool_parameters`: they equal Reasoning and Tools on every endpoint.
- Constant fields, listed above.

## Repeat the method

```sh
python3 -I docs/evidence/2026-10-28-scan-study/analyze.py --output /tmp/scan-study
python3 -I docs/evidence/2026-10-28-scan-study/listing.py --output /tmp/scan-study
```

Both scripts read the retained scan by default, so it reproduces these files. To profile another scan, download it with `packages/scripts/scan-download` and pass `--scan`.
