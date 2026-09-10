# Pricing

An OpenRouter endpoint exposes several overlapping pricing representations. They are independent
signals with different purposes, not interchangeable copies or a consistency hierarchy.

| Field                   | Useful interpretation                                      |
| ----------------------- | ---------------------------------------------------------- |
| `pricing.*` rate fields | Normalized rates currently presented                       |
| `pricing.discount`      | Fractional adjustment already reflected in presented rates |
| `pricing.overrides`     | Opaque conditional-pricing definition                      |
| `display_pricing`       | Presentation-oriented pricing data                         |
| `pricing_json`          | Opaque adapter-specific source pricing object              |
| `pricing_version_id`    | Opaque upstream pricing revision identity                  |
| `tiers`                 | Named service-tier pricing views                           |

- Prices can be extremely small decimal values.
- 🧭 Preserve the upstream decimal representation when comparing prices.
- ⚠️ A small price movement is not evidence of floating-point jitter or meaningless noise.

## API surfaces

OpenRouter's public endpoint API exposes a reduced endpoint representation. The frontend bundle
contains the additional pricing representations used for comprehensive change detection.

- The public response includes normalized `pricing` fields such as `prompt`, `completion`,
  `input_cache_read`, and `discount`.
- [`api-v1-endpoints.md`](appendix/api-v1-endpoints.md) contains a concise public response sample.
- The frontend bundle supplies fields including `display_pricing`, `pricing_json`,
  `pricing_version_id`, and `tiers`.
- ⚠️ A field observed on one API surface is not necessarily exposed on the other.

## `pricing`

`pricing` is OpenRouter's normalized view of the rates it currently presents. Adapter-specific
mapping and conversion mean this object is not reliably derivable from `pricing_json`.

- In the frontend bundle, `prompt`, `completion`, `discount`, and `display_pricing` are present on
  every endpoint.
- A zero meter value and an absent meter are equivalent: both mean **unmetered**.
- Unmetered does not establish whether the endpoint supports the associated feature or is free.
- 🧭 Ignore transitions between zero and absence when interpreting pricing changes; they expose
  OpenRouter's internal representation, not a pricing event.
- `display_pricing` is copied under `pricing` as well as exposed at the endpoint root.
- 🔄 Normalized rates can incorporate a discount or the active band of conditional pricing.

### Text token meters

`prompt` prices text input and `completion` prices text output. The API expresses token rates per
token, while OpenRouter interfaces present text-token rates per million tokens.

- 📊 In the 2026-08-24 bundle, `prompt` and `completion` were present on all 1,231 endpoints,
  including all 1,080 text-input-and-output endpoints.
- Multi-turn agentic workloads repeatedly include earlier messages as input. A response is output
  once, then can become prompt input on every later turn in the same context.
- 📊 One coding workload shown in OpenRouter's dashboard for 2026-08-05 contained 62.2 million
  prompt tokens, 298 thousand reasoning tokens, and 260 thousand completion tokens; more than 99%
  of its raw token volume was prompt input. The caching view showed most prompt tokens as cached.
- ⚠️ Raw token share is not cost share. Cache status, discounts, and different input and output
  rates materially change the bill.
- ⚠️ Some audio-transcription endpoints use `prompt` for a per-audio-hour price. Rendering that
  value as a per-million-token rate produces nonsensical headline prices.

### Prompt-cache meters

Prompt caching changes the price of repeated input. Read and write rates are separate meters rather
than properties of the base `prompt` rate.

- `input_cache_read` prices input served from a prompt cache.
- `input_cache_write` and `input_cache_write_1h` price cache creation where the provider charges for
  it.
- 📊 Among 1,080 text-input-and-output endpoints in the 2026-08-24 bundle,
  `input_cache_read` appeared on 740 (68.5%), `input_cache_write` on 182 (16.9%), and
  `input_cache_write_1h` on 101 (9.4%).
- ⚠️ The economic value of caching depends on the workload, cache hit rate, retention policy, and
  endpoint-specific rates; property presence does not supply a universal savings factor.

### Other meters

Less common meters represent additional modalities or provider services. Their low endpoint count
does not imply low cost or low importance for workloads that use them.

- `web_search` is a flat service charge rather than a token rate; `0.01` is the predominant observed
  value.
- `web_search` is a passthrough charge and is not adjusted by `pricing.discount`.
- `image` prices image input; `image_output` prices provider-side image generation.
- OpenRouter presents `image` and `image_output` per thousand tokens rather than per million tokens.
- `audio` prices audio input; `input_audio_cache` prices cached audio input.
- `internal_reasoning` prices native reasoning tokens when an endpoint exposes a distinct reasoning
  rate.
- 📊 Among 1,080 text-input-and-output endpoints in the 2026-08-24 bundle, `web_search` appeared on
  300 (27.8%); every image, audio, and reasoning meter appeared on fewer than 5%.
- 📊 Full counts for both endpoint populations are recorded in
  [`endpoint-pricing-property-frequency.md`](appendix/endpoint-pricing-property-frequency.md).

## `pricing.discount`

`pricing.discount` is a fractional adjustment that providers can set, applied as `(1 - discount)`.
The normalized rates and headline values in `display_pricing` already include the adjustment.

- `0.2` means 20% off.
- A negative value is a markup and is reflected in presented rates like any other adjustment.
- `discount` is a JSON number; the other normalized rates are represented as decimal strings.
- Provider discount battles produce frequent, fine-grained changes to this field.
- OpenRouter also uses the field for rare, large, fixed-duration site promotions.
- ⚠️ Tiny discount movements in provider discount battles are real pricing events, not float noise.

## `pricing.overrides`

`pricing.overrides` is an array of conditional rate rows. The key is absent when no conditional
pricing is exposed.

- 🧭 Detect schedule pricing when any object in the array has a property beginning with `utc_`.
- Prompt-length rows contain `min_prompt_tokens` and rates above that threshold.
- The normalized `pricing.*` fields present the active schedule band or the default prompt-length
  band.
- 📊 `overrides` appeared on 109 of 1,080 text-input-and-output endpoints (10.1%) in the 2026-08-24
  bundle.
- 🧭 Beyond detecting the type of override in use, the content values should not be interpreted.
- Schedules vary and do not provide a universal base price or default band.
- 🧭 Exclude scheduled pricing observations from pricing-change counts; movement through an
  existing schedule is not repricing.

## `display_pricing`

`display_pricing` supplies presentation labels and tiers for otherwise opaque pricing fields. It is
a view for presentation, not an authored-pricing source.

- Rows use `kind: "token"`, `"unit"`, or `"schedule"` in current observations.
- `display_pricing[].tiers` is distinct from the endpoint's `tiers` object.
- The object is exposed at the endpoint root and copied under `pricing`.
- 🔄 Presentation data can change with normalized rates or independently of them.

## `pricing_version_id`

`pricing_version_id` is an opaque UUID representing an upstream pricing revision. It is not a
content hash and does not describe what changed.

- A new value is not proof that a visible price changed.
- An unchanged value is not proof that presented pricing remained unchanged.
- 🧭 Use equality only as an independent revision signal.

## `pricing_json`

`pricing_json` is an adapter-specific source pricing object. It contains prices alongside
configuration such as thresholds, window bounds, and multipliers.

- Keys are often namespaced SKUs such as `openai_responses:prompt_tokens`.
- Key names and value shapes are not uniform across adapters.
- Values include numeric strings in different decimal forms and JSON numbers.
- `pricing.discount` is separate from this object.
- 🧭 Do not parse `pricing_json`. Treat the complete value as an opaque change signal.

## `tiers`

`tiers` describes named service tiers such as flex or priority. It is distinct from both
`display_pricing[].tiers` and `pricing.overrides`.

- 🧭 Treat the complete value as an independent change signal.

## Change-signal relationships

Pricing fields overlap without forming a hierarchy. Durable change detection records which signals
moved and does not infer that one changed field explains another.

- 🧭 Compare the normalized rate fields inside `pricing` independently of `pricing.discount`,
  `pricing.overrides`, `pricing.display_pricing`, root `display_pricing`, `pricing_json`,
  `pricing_version_id`, and `tiers`.
- 🧭 Record simultaneous changes without assigning precedence or causation.
- 🧭 Compare exact values regardless of the movement's magnitude.
- `pricing.discount` can change while `pricing_json` and `pricing_version_id` remain stable.
- The active normalized rates of an existing schedule can change while `pricing.overrides`,
  `pricing_json`, and `pricing_version_id` remain stable.
- `pricing_version_id` can change while `pricing_json`, normalized `pricing`, `display_pricing`, and
  `tiers` remain stable.
- `display_pricing` can change independently of normalized rates and authored-pricing signals.
- 📊 Across 270 observations of `deepseek/deepseek-v4-flash-0731` from 2026-05-08 through
  2026-08-24, 54 `pricing_version_id` transitions included 49 `pricing_json` transitions and five
  version-only transitions. Four of the five had no other stable non-telemetry content change; the
  fifth accompanied an adapter migration.

## Historical data

Pricing representations and individual keys have been introduced and removed over time. Compare
the state actually present in each observation.

- 🧭 Preserve the raw observations, but normalize zero and absent meters to unmetered for analysis.
- Historical snapshots include temporary upstream mistakes, schema migrations, and mass property
  changes as well as pricing changes.
- 🧭 Investigate spikes before interpreting them as market activity.
- Pricing conventions and feature adoption have changed substantially during collection; use the
  population listed at each historical time rather than today's survivors to measure historical
  prevalence.

## Reasoning meters

`pricing.internal_reasoning` is a distinct rate on some endpoints. Native reasoning tokens can be a
subset of native completion tokens rather than an additional token count.

- When completion and reasoning rates differ, calculate a non-double-counted cost as:

  ```text
  (native completion tokens - native reasoning tokens) * completion rate
  + native reasoning tokens * internal_reasoning rate
  ```

- If no distinct reasoning rate exists, all native completion tokens, including the reasoning
  subset, use the completion rate.
- Some offerings expose a separate internal-research meter whose provider counters are absent from
  generic generation exports.
- ⚠️ Missing provider-specific counters cannot be inferred from normalized token totals.
