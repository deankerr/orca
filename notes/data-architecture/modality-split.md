# The modality split: non-LLM offerings in the endpoint pipeline

OpenRouter forces its non-LLM offerings (image generation, embeddings, video, speech,
transcription, rerank) through the same catalog/endpoint pipeline as chat models. This is a
major source of endpoint complexity — especially in pricing. Grouping scopes by
`model.output_modalities` (joined with `_`) separates the species cleanly for study.

Numbers below are from pass `2026-07-24T03:46:13.868Z` (431 scopes, 1,052 endpoints).

## The groups

| group           | scopes | endpoints | share of scopes                   |
| --------------- | -----: | --------: | --------------------------------- |
| `text`          |    314 |       919 | 73%                               |
| `image`         |     29 |        29 | non-LLM                           |
| `embeddings`    |     27 |        34 | non-LLM                           |
| `video`         |     17 |        17 | non-LLM                           |
| `speech`        |     15 |        17 | non-LLM (TTS)                     |
| `transcription` |     12 |        13 | non-LLM (STT)                     |
| `image_text`    |      9 |        15 | hybrid (Gemini image, GPT image…) |
| `rerank`        |      4 |         4 | non-LLM                           |
| `text_audio`    |      4 |         4 | hybrid (music/audio gen)          |

Over a quarter of scopes are non-LLM. Endpoint-to-scope fan-out concentrates in `text`
(~2.9 endpoints/scope vs ~1.0–1.3 elsewhere) — provider competition is an LLM phenomenon.

## Pricing: the flat fields are a lie outside `text`

Every endpoint carries `pricing.prompt` / `pricing.completion`, but outside text-like groups
they are mostly placeholder zeros:

- `video`: prompt **and** completion `"0"` on 17/17. `rerank`: 4/4. `image`: prompt `"0"` on
  24/29, completion on 26/29. `embeddings`: completion `"0"` on 34/34 (prompt is real — the
  one per-token non-LLM species). `speech`/`transcription`: prompt real (per-token input),
  completion `"0"` on ~85%.
- The real prices live in `pricing_json`, keyed by adapter-specific SKU names, with unit
  families per modality: `image` → `cents_per_image_output` (+ per-resolution, moodboard,
  style-reference variants), `video` → `duration_seconds_*` (per resolution × with/without
  audio × text-to-video/image-to-video), `speech` → `characters`, `transcription` →
  `audio_minutes` / `audio_hours` / `audio_seconds`, `rerank` → `search-units`, `embeddings`
  → `prompt_tokens` (+ per-input-type token SKUs). Note `search-units` — kebab-case in a
  snake_case namespace, so SKU names cannot be assumed to follow a convention.
- `display_pricing[].kind` confirms the split: `token` dominates text-like groups, `unit`
  dominates image/video/speech/transcription/rerank. It's the closest thing to an upstream
  declaration of the pricing model.
- Even inside `text`, `pricing_json` has ~75 distinct SKU names (tiered context thresholds,
  cache write durations, priority/flex multipliers, `x_search_calls`, violation fees…) — the
  pricing drill-down should start from `pricing_json`, treating `pricing` as the simplified
  token-only view it actually is.

## Capability fields are boilerplate outside `text`

The shared pipeline stamps LLM-shaped fields onto everything, so absence of meaning ≠ absence
of the field:

- `supported_parameters` advertises `temperature`/`top_p`/`max_tokens` on **every** modality —
  including all 34 embeddings endpoints and all 4 rerank endpoints. These cannot be sampling
  controls for an embedding; the list is only trustworthy for text-like groups.
- `features.supports_tool_choice` is present on all 1,052 endpoints regardless of modality.
  The meaningful feature flags (`supports_native_web_search`, `supports_input_audio`,
  reasoning-related, file/video URL support) live almost entirely in `text`/`image_text`.
- `supported_video_parameters` is non-null on 103 `text` endpoints and even on
  embeddings/rerank endpoints — while the actual video-generation params (resolutions,
  durations, frame images) are the 17 in `video`. Same field, different meanings.

## What is genuinely modality-specific

- `image`/`image_text`: `supported_image_parameters` (aspect ratios, quality, input
  references), `allowed_passthrough_parameters` (style/moodboard params passed through to the
  provider — 25/29 image endpoints).
- `video`: `supported_video_parameters` with resolutions/durations, passthrough params on 13/17.
- `speech`: `model.supported_tts_voices` (13/15 scopes — the only place voices appear).
- `embeddings`: per-input-type token SKUs (`text_input_tokens`, `image_input_tokens`, …) on
  multimodal embedders.
- `text`: everything reasoning-, cache-, and tool-related; `is_free` variants; overrides and
  context-threshold tiering.

## Implications for canonicalization

1. Pricing must be modelled per pricing-family (token / unit / duration / characters /
   search-units), not per field — `pricing_json` is the source of truth, `display_pricing[].kind`
   a useful classifier hint.
2. A capability claim ("supports temperature") is only meaningful conditional on the modality
   group; Layer 2 comparisons should never compare capability fields across groups.
3. The modality group key (`output_modalities` joined) is a strong candidate for a first-class
   canonical model column — it predicts which fields carry signal better than any other single
   property.
