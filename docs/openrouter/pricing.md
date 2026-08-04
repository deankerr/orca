# Pricing

An OpenRouter endpoint can expose several overlapping pricing representations. They are views with
different purposes, not interchangeable copies.

## `pricing_json`

`pricing_json` is the most detailed upstream rate card. Its keys are adapter-namespaced SKUs such
as `openai_responses:prompt_tokens` and cover token and non-token units.

It is neither a uniform schema nor purely a map of prices:

- SKU names vary by adapter and are not consistently styled; `search-units` is a known kebab-case
  example among snake-case keys.
- Values can use authored forms such as `"0.25e-6"`, `".03e-6"`, or a JSON number.
- Non-price values include `long_context_threshold`, tier multipliers, upstream-cost fields, and
  informational rates.

Parse numeric values before comparing them. A textual rewrite is not necessarily a price change;
the original representation remains useful as provenance.

Observed unit families include tokens, images, resolution-specific image output, video duration,
characters, audio time, and search units.

⚠️ The flat `pricing.prompt` and `pricing.completion` fields are often placeholder zeroes outside
text-like modalities. Actual non-text rates generally live in `pricing_json` as unit-, duration-,
character-, image-, audio-, or search-based SKUs. `display_pricing[].kind` (`token` or `unit`) is
the closest observed upstream declaration of the pricing family, but ❓ its exact contract is not
established.

## `pricing`

`pricing` is OpenRouter's normalized, simplified view. It includes familiar fields such as
`prompt`, `completion`, cache rates, `web_search`, and `internal_reasoning`, plus `overrides` for
long-context pricing.

Much of it is computed from `pricing_json`:

- ordinary values reflect a source SKU adjusted by `discount`;
- tier prices apply the corresponding tier multiplier;
- long-context overrides use long-context SKUs and a threshold.

It is not fully derivable from `pricing_json`, however. Observed exceptions include:

- `web_search` values with no matching source SKU;
- `image_token` and `image_output` conversions whose factors are not exposed;
- `input_cache_write`, observed as a conversion from storage-hour pricing;
- repeating decimal strings that preserve OpenRouter's own unit arithmetic.

## `display_pricing`

`display_pricing` is the presentation-oriented view. It supplies labels for otherwise opaque SKUs,
including tier and specialized image semantics. Its `kind` value (`token` or `unit`) is a useful
hint about the declared pricing family.

A copy of `display_pricing` has also been observed embedded inside `pricing`.

## `tiers`

`tiers` describes named service tiers such as flex or priority. Its prices have been observed as
base rates multiplied by tier-specific multipliers.

## `pricing_version_id`

`pricing_version_id` is an opaque UUID and a broad change detector, not a price-change record. In
39 observed transitions it changed 13 times: 10 alongside a real SKU change and 3 without one; it
missed no real changes in that sample.

## Discounts and apparent churn

`discount` can cause many computed fields and display rows to move while list prices remain fixed.
Small, frequent discount changes and large list-price changes are economically different even when
they touch the same fields. Compare underlying numeric rates and discount separately.

## Reasoning meters

OpenRouter exposes a normalized `pricing.internal_reasoning` rate on some endpoints. Reasoning
tokens are not always an additional charge on top of the same completion tokens; the accounting
depends on the provider's meter.

For ordinary reasoning models, native reasoning tokens can be a subset of native completion
tokens. When completion and reasoning rates differ, the non-double-counting model is:

```text
(native completion tokens - native reasoning tokens) * completion rate
+ native reasoning tokens * internal_reasoning rate
```

If an endpoint has no distinct reasoning rate, all native completion tokens—including the
reasoning subset—are charged at the completion rate. This interpretation was numerically confirmed
against observed Gemini 3.5 Flash, MiniMax M3, and GPT-5 Nano generation charges.

### Billing reconciliation evidence

📌 **Observed 2026-07-21:** three generation records reconciled exactly using native prompt and
completion counts without adding their reasoning-token subsets a second time.

| Endpoint                           | Calculation                       | Reported charge |
| ---------------------------------- | --------------------------------- | --------------: |
| Gemini 3.5 Flash, Google AI Studio | `13,176 × $1.50/M + 198 × $9/M`   |       $0.021546 |
| MiniMax M3, Morph                  | `181 × $0.60/M + 728 × $2.40/M`   |      $0.0018558 |
| GPT-5 Nano, OpenAI                 | `331 × $0.05/M + 2,832 × $0.40/M` |     $0.00114935 |

The Gemini record reported 180 reasoning tokens within 198 native completion tokens. The MiniMax
record reported 64 within 728, and the GPT-5 Nano record reported 2,688 within 2,832. Charging those
reasoning counts again would not match the reported totals.

Some offerings expose a genuinely separate internal-research meter. Perplexity Sonar Deep Research
has been observed with separate prompt, completion, internal reasoning, citation, and search-query
components. Its internal-reasoning charge is additional to visible output, but that does not imply
that one token was charged twice; it is a different provider meter.

A generic OpenRouter generation export may omit the provider-specific counters needed to reproduce
such a bill. `native_tokens_reasoning: 0` is not proof that no private research-reasoning charge
occurred, and normalized token counts should not be substituted for missing native usage details.

📌 In one observed Sonar Deep Research record, native prompt and completion usage explained only
$0.104338 of a $0.626460 charge. The remaining $0.522122 depended on citation-token,
internal-reasoning, and search-query counters absent from the export. The missing counters were
therefore not uniquely recoverable.

Primary references:

- [OpenRouter reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [OpenRouter Responses reasoning schema](https://openrouter.ai/docs/api/reference/responses/reasoning)
- [OpenRouter API overview](https://openrouter.ai/docs/api/reference/overview)
- [Google Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking)
- [Perplexity pricing](https://docs.perplexity.ai/docs/getting-started/pricing)

## Historical representations

The basic `pricing` object was present throughout the corpus from 2025-08-13 through 2026-08-01.
Individual keys appeared and disappeared, so a missing historical key is not automatically
equivalent to a zero rate.

Four descriptive eras explain the other representations:

1. Before 2025-12-22: `pricing` and `variable_pricings`.
2. From 2025-12-22: gradual adoption of `pricing_json`; `pricing_version_id` followed on
   2026-01-10, with temporary `line_items` from 2026-02-10 through 2026-04-01.
3. From 2026-04-01: `display_pricing`; `variable_pricings` disappeared on 2026-04-17.
4. From 2026-07-09: sparse `tiers`, followed by `pricing.overrides` on 2026-07-13.
