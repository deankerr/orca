# `reasoning_output` Pricing

Research date: 2026-07-21

## Conclusion

Gemini thinking consumes billable output tokens, but `reasoning_output` is not a surcharge applied on top of charging those same tokens as completion tokens.

In ORCA, `reasoning_output` is the public name for OpenRouter's endpoint pricing field `internal_reasoning` ([projection](../packages/backend/convex/public_api/preview_v2.ts)). It should be interpreted as the rate for the reasoning subset of output tokens. If completion and reasoning rates differ, the accounting model is:

```text
(native completion tokens - native reasoning tokens) * completion rate
+ native reasoning tokens * reasoning_output rate
```

It is not:

```text
native completion tokens * completion rate
+ native reasoning tokens * reasoning_output rate
```

The latter double-counts reasoning.

## Primary-source evidence

- [OpenRouter's reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) says reasoning tokens are output tokens and are charged accordingly.
- [OpenRouter's Responses reasoning schema](https://openrouter.ai/docs/api/reference/responses/reasoning) reports `reasoning_tokens` inside `output_tokens_details`, i.e. as a breakdown of total output rather than an additional total.
- [Google's Gemini 3.5 Flash pricing](https://ai.google.dev/gemini-api/docs/pricing) lists standard pricing as $1.50 per million input tokens and $9.00 per million output tokens, explicitly including thinking tokens.
- [Google's thinking documentation](https://ai.google.dev/gemini-api/docs/thinking) says response pricing includes output and thinking tokens and bills the full generated thought-token count even if the API exposes only a summary.
- [OpenRouter's Gemini 3.5 Flash endpoint API](https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-20260519/endpoints) lists the standard Google AI Studio endpoint's `completion` and `internal_reasoning` rates as the same $0.000009 per token ($9/M).

## Reconciliation of the supplied records

### Gemini 3.5 Flash through Google AI Studio

```text
13,176 native input * $1.50/M = $0.019764
198 native completion * $9/M = $0.001782
                                  ---------
reported usage                    $0.021546
```

The calculation matches exactly. The 180 native reasoning tokens are a subset of the 198 native completion tokens, leaving 18 other native output tokens. Adding the 180 reasoning tokens again would produce $0.023166, which contradicts the reported charge.

This means reasoning did increase the cost relative to generating only the 18 non-reasoning output tokens, but there was no special premium or second charge: all 198 output tokens were billed once at the same $9/M rate.

### MiniMax M3 through Morph

The [OpenRouter endpoint API](https://openrouter.ai/api/v1/models/minimax/minimax-m3-20260531/endpoints) lists Morph at $0.60/M prompt and $2.40/M completion, with no separate reasoning rate.

```text
181 * $0.60/M + 728 * $2.40/M = $0.0018558
```

That exactly matches reported usage even though 64 of the 728 completion tokens are reasoning tokens.

### GPT-5 Nano through OpenAI

The [OpenRouter endpoint API](https://openrouter.ai/api/v1/models/openai/gpt-5-nano-2025-08-07/endpoints) lists OpenAI at $0.05/M prompt and $0.40/M completion, with no separate reasoning rate.

```text
331 * $0.05/M + 2,832 * $0.40/M = $0.00114935
```

That exactly matches reported usage even though 2,688 of the 2,832 completion tokens are reasoning tokens.

Across all three records, `native_tokens_reasoning` is therefore a subset of `native_tokens_completion`. The normalized `tokens_completion` field is not the count used to reproduce these charges; the native counts are.

## Sonar Deep Research is different

For Perplexity's Sonar Deep Research endpoint, `reasoning_output` is a genuine separate billing category rather than a redundant copy of the completion rate. ORCA still obtains the field by renaming OpenRouter's `pricing.internal_reasoning`, but the live [OpenRouter endpoint API](https://openrouter.ai/api/v1/models/perplexity/sonar-deep-research/endpoints) currently lists four distinct rates:

| Meter              |         Rate |
| ------------------ | -----------: |
| Prompt             |  $2/M tokens |
| Completion         |  $8/M tokens |
| Internal reasoning |  $3/M tokens |
| Web search         | $0.005/query |

[Perplexity's pricing documentation](https://docs.perplexity.ai/docs/getting-started/pricing) additionally identifies citation tokens at $2/M. It defines Sonar Deep Research's search-query and reasoning-token meters separately from the initial user query and visible output. Unlike Sonar, Sonar Pro, and Sonar Reasoning Pro, Deep Research has no low/medium/high context-size request fee; it instead pays for the autonomous searches it performs. The [Sonar Deep Research model documentation](https://docs.perplexity.ai/docs/sonar/models/sonar-deep-research) shows these five components separately in both its response metadata and worked billing example.

### Reconciliation of the supplied Sonar record

The two counters exposed in the generation record explain only part of the charge:

```text
37 native prompt tokens * $2/M       = $0.000074
13,033 native completion tokens * $8/M = $0.104264
                                          ---------
known subtotal                            $0.104338
reported usage                            $0.626460
                                          ---------
unitemized Deep Research usage            $0.522122
```

That remainder consists of some combination of citation tokens, autonomous search queries, and internal research-reasoning tokens. In microdollars, the unknown counts must satisfy:

```text
2 * citation_tokens + 5,000 * search_queries + 3 * internal_reasoning_tokens
= 522,122
```

The supplied JSON does not contain any of those three counters: `num_search_results` is not the number of search queries, `usage_data` is null, and there are no citation-token or internal-research-token fields. The charge therefore cannot be decomposed uniquely from this export. For example, the following is one numerically exact solution, but the counts are illustrative rather than recoverable facts:

```text
37 prompt tokens                  = $0.000074
13,033 output tokens              = $0.104264
61,096 citation tokens            = $0.122192
83,310 internal reasoning tokens  = $0.249930
30 search queries                 = $0.150000
                                     ---------
                                     $0.626460
```

Many other integer combinations produce the same total.

The record's `native_tokens_reasoning: 0` does not demonstrate that no internal-reasoning charge occurred. Perplexity exposes Deep Research's reasoning as its own usage counter, while OpenRouter's generic reasoning field describes normalized model reasoning tokens. This generation export evidently did not map Perplexity's private internal-research counter into `native_tokens_reasoning`; otherwise its known prompt and completion usage could not explain only one-sixth of the bill. Similarly, `tokens_completion: 96,344` is not a substitute for the missing counter: [OpenRouter's API documentation](https://openrouter.ai/docs/api/reference/overview) says pricing is based on native token counts, and the difference between `tokens_completion` and `native_tokens_completion` does not yield an exact reconciliation.

The practical conclusion is:

- Gemini's `reasoning_output` records the rate for a completion-token subset and does not stack a second charge on those tokens.
- Sonar Deep Research's `reasoning_output` records a separately metered internal research process at $3/M tokens. It is an additional cost alongside visible output, citations, and searches, but it is not evidence that the same tokens are double-charged.
- An exact audit requires the original Perplexity-style usage breakdown (citation tokens, search-query count, and reasoning tokens), which this OpenRouter generation export does not retain.
