# Modalities

OpenRouter represents text generation, image generation, embeddings, video, speech,
transcription, reranking, and hybrid models through a shared catalog and endpoint schema. Fields
that are meaningful for one modality can be placeholders or boilerplate for another.

`model.output_modalities` is the most useful first discriminator. Joining its values with `_`
produced these observed groups on 2026-07-24:

| Output group    | Model-variant scopes | Endpoints |
| --------------- | -------------------: | --------: |
| `text`          |                  314 |       919 |
| `image`         |                   29 |        29 |
| `embeddings`    |                   27 |        34 |
| `video`         |                   17 |        17 |
| `speech`        |                   15 |        17 |
| `transcription` |                   12 |        13 |
| `image_text`    |                    9 |        15 |
| `rerank`        |                    4 |         4 |
| `text_audio`    |                    4 |         4 |

Text offerings had much greater provider fan-out: about 2.9 endpoints per scope, compared with
roughly 1.0–1.3 for other groups in this observation.

## Capability interpretation

Shared fields are not universally meaningful:

- `supported_parameters` advertised `temperature`, `top_p`, and `max_tokens` even for embeddings
  and reranking endpoints.
- `features.supports_tool_choice` appeared on every endpoint in the observation.
- `supported_video_parameters` appeared on text, embedding, and reranking endpoints as well as
  actual video-generation endpoints, with different meanings.

Capability claims should therefore always be qualified by modality.

Genuinely modality-specific signals include:

- image and image-text: `supported_image_parameters` and image-style passthrough parameters;
- video: supported resolutions and durations in `supported_video_parameters`;
- speech: model-level `supported_tts_voices`;
- text: reasoning, cache, and tool behavior.
