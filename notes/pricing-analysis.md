# Pricing Field Analysis

Analysis of all 1,747 endpoints as of 2026-05-04.

---

## Overview

| Status                              | Count |
| ----------------------------------- | ----- |
| Total endpoints                     | 1,747 |
| Active (not disabled, not deranked) | 1,711 |
| Deranked                            | 34    |
| Disabled                            | 2     |

---

## Field Presence

| Field               | Count | % of total |
| ------------------- | ----- | ---------- |
| `text_input`        | 1,577 | 90.3%      |
| `text_output`       | 1,534 | 87.8%      |
| `text_cache_read`   | 563   | 32.2%      |
| `web_search`        | 157   | 9.0%       |
| `text_cache_write`  | 128   | 7.3%       |
| `image_input`       | 62    | 3.5%       |
| `discount`          | 56    | 3.2%       |
| `audio_input`       | 40    | 2.3%       |
| `reasoning_output`  | 33    | 1.9%       |
| `audio_cache_write` | 33    | 1.9%       |
| `image_output`      | 21    | 1.2%       |

---

## Value Ranges (display-scaled)

| Field               | n     | Min          | Median     | Max            | Unique values |
| ------------------- | ----- | ------------ | ---------- | -------------- | ------------- |
| `text_input`        | 1,577 | $0.003/MTOK  | $0.30/MTOK | $111,000/MTOK† | 190           |
| `text_output`       | 1,534 | $0.006/MTOK  | $1.10/MTOK | $600/MTOK      | 224           |
| `text_cache_read`   | 563   | $0.003/MTOK  | $0.13/MTOK | $7.50/MTOK     | 100           |
| `text_cache_write`  | 128   | $0.058/MTOK  | $2.88/MTOK | $37.5/MTOK     | 25            |
| `reasoning_output`  | 33    | $0.30/MTOK   | $2.50/MTOK | $12.0/MTOK     | 7             |
| `audio_input`       | 40    | $0.075/MTOK  | $1.00/MTOK | $100/MTOK      | 12            |
| `audio_cache_write` | 33    | $0.030/MTOK  | $0.10/MTOK | $0.20/MTOK     | 6             |
| `image_input`       | 62    | $0.000075/1K | $0.002/1K  | $24.00/1K      | 25            |
| `image_output`      | 21    | $0.003/1K    | $0.030/1K  | $0.12/1K       | 15            |
| `web_search`        | 157   | $0.005/req   | $0.010/req | $0.035/req     | 6             |
| `discount`          | 56    | 5%           | 35%        | 100%           | 9             |

†Groq whisper audio models, priced per audio token — not comparable to language model pricing, see below.

---

## Structural Patterns

These ratios reflect **provider pricing decisions**, not intrinsic model properties. 131 out of the models with both fields set appear with different output/input ratios across providers — the same model can be 4:1 on its native provider and 1:1 on an inference aggregator.

### `text_output` / `text_input` ratio

| Ratio  | Endpoints | Unique models | Notes                                                                                                             |
| ------ | --------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| 4:1    | 222       | 117           | Most common — OpenAI, Google, many others                                                                         |
| 1:1    | 173       | 94            | Flat per-token rate — inference aggregators (Together 41, Hyperbolic 26, DeepInfra 18, Novita 15, Fireworks 9, …) |
| 5:1    | 151       | 68            |                                                                                                                   |
| 3:1    | 147       | 93            |                                                                                                                   |
| 8:1    | 65        | 30            |                                                                                                                   |
| 2:1    | 62        | 47            |                                                                                                                   |
| 6:1    | 42        | 26            |                                                                                                                   |
| 3.67:1 | 28        | 15            | CNY→USD artefact                                                                                                  |
| 1.5:1  | 27        | 20            |                                                                                                                   |
| 4.17:1 | 21        | 7             | CNY→USD artefact                                                                                                  |

The long tail continues — there are ~30 more distinct ratios beyond the top 10, almost all from CNY-denominated or provider-specific pricing. Non-integer ratios (3.67, 4.17, 3.33, 3.2, 3.14, etc.) consistently originate from CNY-denominated prices converted to USD at a fixed exchange rate.

### `text_cache_read` / `text_input` ratio

The dominant buckets are clean fractions, but the actual distribution has a long tail — 95 unique ratios total across 564 endpoints. Outside the top five buckets, every remaining ratio has ≤10 endpoints and most have 1.

| Ratio           | Endpoints | Notes                                             |
| --------------- | --------- | ------------------------------------------------- |
| 1/10            | 181       | OpenAI, Google — 10× cheaper than input           |
| 1:1             | 50        | No cache discount                                 |
| 1/2             | 83        | Anthropic-style                                   |
| 1/5             | 53        |                                                   |
| 1/4             | 42        |                                                   |
| 1/6             | 7         |                                                   |
| ~0.183          | 10        | CNY/FX artefact                                   |
| ~0.186          | 9         | CNY/FX artefact                                   |
| 1/8             | 5         |                                                   |
| 1/12            | 6         |                                                   |
| everything else | ~118      | One-off provider pricing, mostly single endpoints |

The 1:1 case (50 endpoints) means caching is available but not cheaper — the provider charges the same rate to read from cache as to process fresh input.

### `reasoning_output` / `text_output` ratio

32 of 33 reasoning endpoints price thinking tokens at exactly **1:1 with output**. The sole exception is `perplexity/sonar-deep-research` at 0.375 (thinking tokens cheaper than output). All are Google Gemini models, which charge the same rate regardless of whether a token is a thinking token or a response token.

### `web_search` pricing

Only 6 price points across 157 endpoints — effectively a surcharge per search call.

| Price/req | Endpoints | Providers                         |
| --------- | --------- | --------------------------------- |
| $0.005    | 22        | xAI (Grok models) + OpenAI gpt-5  |
| $0.010    | 101       | Anthropic, OpenAI (most models)   |
| $0.014    | 31        | Google Gemini                     |
| $0.018    | 1         | perplexity/sonar-pro-search       |
| $0.028    | 1         | openai/gpt-4o-mini-search-preview |
| $0.035    | 1         | openai/gpt-4o-search-preview      |

---

## Endpoints Without Pricing

153 endpoints have no pricing fields set at all.

| Category                          | Count |
| --------------------------------- | ----- |
| `:free` slug                      | 123   |
| Stealth / unreleased alpha models | ~11   |
| Video / audio generation          | ~6    |
| Other active, no pricing          | ~13   |

**Free endpoints** (123): These carry a `discount=100%` equivalent semantically — the source data has no price because they are zero-cost promotional tiers, not because the data is missing. Providers include chutes (42), venice (13), open-inference (10), google-ai-studio (free tiers), nvidia.

**Stealth models** (11): `openrouter/` alpha slugs (bert-nebulon, sonoma-dusk, andromeda, polaris, sherlock-dash, etc.) — unreleased models with no public pricing.

**Video / audio generation** (≥6): `openai/sora-2-pro`, `google/veo-3.1`, `google/lyria-3-*`, `bytedance/seedance-1-5-pro`, `alibaba/wan-2.6` — these are non-token-based models where per-token pricing does not apply. They will need a different pricing model representation.

---

## input-Only Models (`text_input` set, `text_output` missing)

43 endpoints across two categories:

**Embedding models** (26): Standard vector embedding models — consume tokens to produce embeddings, never generate. Examples: `openai/text-embedding-3-*`, `baai/bge-*`, `qwen/qwen3-embedding-*`, `sentence-transformers/*`.

**Speech/audio output models** (11): TTS and audio generation — `openai/gpt-4o-mini-tts`, `qwen/qwen3-tts`, `hexgrad/kokoro-82m`, `sesame/csm-1b`, `zyphra/zonos-*`, etc. These consume text tokens to produce audio, so `text_output` is irrelevant.

**Speech-to-text models** (6): `openai/whisper-*` and `openai/whisper-large-v3-turbo` — consume audio represented as tokens. Their `text_input` values of $6,000–$111,000/MTOK are not anomalies; audio produces far more tokens per second of content than text does, so the per-MTOK rate is high while the per-minute cost is reasonable. These should likely be treated as a distinct category or filtered from text pricing comparisons.

---

## Anomalies and Edge Cases

**`cache_write` without `cache_read`** (7 endpoints): All from Alibaba/Qwen (`qwen-plus-2025-07-28`, `qwen3.5-flash-02-23`, `qwen3.5-plus-02-15`, `qwen3.6-plus`, `qwen3.6-max-preview`, `qwen3.6-flash`). These models charge for writing cache but publish no read price — either it is free, or the data hasn't been sourced yet.

**`image_input` range**: 320,000× spread from $0.000075/1K (Gemini Flash Lite, tile-based) to $24/1K (Claude 3 Opus, per-image pricing). These represent fundamentally different billing units — tile counts vs. whole images — and are not directly comparable.

**`discount` field semantics**: The stored pricing values are the **post-discount prices**. The `discount` field records the percentage discount as a display annotation only (confirmed: minimax/minimax-m2 stores $0.255 with `discount=15%`; undiscounted providers serve the same model at $0.30). The discount field is Alibaba-heavy — 35% discount on nearly all Qwen models — with a handful of 100% discounts (free tiers), one 50% (openai/gpt-5), and a few outliers (kwaipilot 31%, moonshotai 5%).
