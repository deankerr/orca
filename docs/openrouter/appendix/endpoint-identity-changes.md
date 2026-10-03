# Endpoint identity changes: September 2026 observations

## Finding

Model changes for an endpoint UUID are real but uncommon in the retained production data:
**19 changes across 2,832 endpoint UUIDs (0.67%)**, with one change per affected endpoint.
All observed changes follow recognizable variant or naming patterns.

For ORCA, **a changed model slug is a model change**, including a `:free` suffix, capitalization,
or naming correction. Recognizing a pattern does not authorize ORCA to collapse those identities
or ignore the transition. The evidence establishes frequency, not an invariant that model
membership never changes.

## Scope and method

Read-only inspection of retained production listing history on 2026-09-26:

| Measurement                                         | Result |
| --------------------------------------------------- | -----: |
| Listing history documents                           |  5,920 |
| Distinct endpoint UUIDs in listing history          |  2,832 |
| Model changes                                       |     19 |
| Endpoint UUIDs with model changes                   |     19 |
| Provider ID changes                                 |     56 |
| Provider tag changes                                |    508 |
| Duplicate observation timestamps within an endpoint |      0 |

The read requested up to 30,000 listing documents and returned 5,920, so it was not truncated.
Rows were grouped by `endpoint_id`, sorted by `scan_at`, and adjacent rows compared for changes
to `model_id`, `provider_id`, and `provider_tag`. These counts include changes across an
unlisted/relisted boundary; the three categories can overlap.

The earliest listing observation was `2025-08-13T20:19:21.211Z`; the latest was
`2026-09-26T05:40:04.126Z`. These are timestamps of listing records, not a claim about the latest
processed scan: unchanged context produces no new listing record. The analysis covers retained
observations, not changes before the baseline or between source captures.

The production dashboard's approximately 5.9K listing documents and 2.8K endpoint documents
are consistent with this scale. The exact 2,832 count above is distinct UUIDs in listing history,
not a separate count of Catalog documents.

## Observed patterns

| Pattern                                                 | Changes |
| ------------------------------------------------------- | ------: |
| Adding or removing `:free`                              |      14 |
| Capitalization: `Nex-N2-Pro` → `nex-n2-pro`             |       3 |
| Naming order: `claude-4.5-sonnet` → `claude-sonnet-4.5` |       1 |
| Namespace: `reka/reka-edge` → `rekaai/reka-edge`        |       1 |

None appears to be a reassignment to an unrelated model. This is an interpretation of the
observed slug patterns, not proof that the underlying models are equivalent.

### All model transitions

Dates are UTC observation dates. Each row represents a distinct endpoint UUID.

| Date       | Provider    | Previous model ID                       | New model ID                               |
| ---------- | ----------- | --------------------------------------- | ------------------------------------------ |
| 2025-08-28 | chutes      | `qwen/qwen3-30b-a3b-thinking-2507:free` | `qwen/qwen3-30b-a3b-thinking-2507`         |
| 2025-09-10 | nvidia      | `nvidia/nemotron-nano-9b-v2`            | `nvidia/nemotron-nano-9b-v2:free`          |
| 2025-09-29 | anthropic   | `anthropic/claude-4.5-sonnet`           | `anthropic/claude-sonnet-4.5`              |
| 2025-10-01 | chutes      | `meituan/longcat-flash-chat`            | `meituan/longcat-flash-chat:free`          |
| 2025-10-01 | chutes      | `alibaba/tongyi-deepresearch-30b-a3b`   | `alibaba/tongyi-deepresearch-30b-a3b:free` |
| 2025-10-08 | atlas-cloud | `z-ai/glm-4.5-air`                      | `z-ai/glm-4.5-air:free`                    |
| 2025-11-10 | gmicloud    | `minimax/minimax-m2:free`               | `minimax/minimax-m2`                       |
| 2026-01-04 | chutes      | `z-ai/glm-4.5-air:free`                 | `z-ai/glm-4.5-air`                         |
| 2026-01-04 | chutes      | `openai/gpt-oss-20b:free`               | `openai/gpt-oss-20b`                       |
| 2026-01-05 | parasail    | `allenai/olmo-3-32b-think:free`         | `allenai/olmo-3-32b-think`                 |
| 2026-01-05 | parasail    | `allenai/olmo-3.1-32b-think:free`       | `allenai/olmo-3.1-32b-think`               |
| 2026-01-09 | siliconflow | `nex-agi/deepseek-v3.1-nex-n1:free`     | `nex-agi/deepseek-v3.1-nex-n1`             |
| 2026-01-10 | parasail    | `allenai/molmo-2-8b`                    | `allenai/molmo-2-8b:free`                  |
| 2026-04-01 | reka        | `reka/reka-edge`                        | `rekaai/reka-edge`                         |
| 2026-05-14 | baidu       | `baidu/qianfan-ocr-fast:free`           | `baidu/qianfan-ocr-fast`                   |
| 2026-06-08 | siliconflow | `nex-agi/Nex-N2-Pro:free`               | `nex-agi/nex-n2-pro:free`                  |
| 2026-06-08 | novita      | `nex-agi/Nex-N2-Pro:free`               | `nex-agi/nex-n2-pro:free`                  |
| 2026-06-08 | nex-agi     | `nex-agi/Nex-N2-Pro:free`               | `nex-agi/nex-n2-pro:free`                  |
| 2026-07-23 | novita      | `inclusionai/ling-3.0-flash`            | `inclusionai/ling-3.0-flash:free`          |

The LongCat, Tongyi DeepResearch, and Qianfan OCR transitions followed an unlisted observation.
The other 16 transitions were between listed observations. Provider ID and tag stayed unchanged
at all 19 model transitions.
