# Schema evolution

OpenRouter's model and endpoint schemas evolve continuously. Historical records should not be read
as if they used the current field set. This article covers non-pricing fields.

The observations below come from 19,245 captures between 2025-08-13 and 2026-08-01, including more
than 15.6 million successful text-endpoint observations.

## Model fields

The model schema was mostly additive during this period:

| First observed (UTC)     | Fields                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| 2025-09-15 to 2025-09-17 | `default_parameters`, `default_order`, `promotion_message`            |
| 2025-11-03 to 2025-11-06 | `quick_start_example_type`, `is_trainable_image`, `is_trainable_text` |
| 2025-11-25               | `routing_error_message`                                               |
| 2025-12-16               | `supports_reasoning`                                                  |
| 2026-03-25               | `knowledge_cutoff`                                                    |
| 2026-04-03 to 2026-04-19 | `author_display_name`, limits, `supported_tts_voices`                 |
| 2026-05-06               | `is_private`; temporary `owner_clerk_user_id`                         |
| 2026-07-15 to 2026-07-24 | preview and attestation fields                                        |
| 2026-07-27 to 2026-07-31 | author modality, preview, and icon fields                             |

⚠️ Partially deployed fields were often visible for one capture before becoming universal. This is
consistent with rolling deployment, but does not establish a durable schema version.

## Endpoint fields

Endpoint identity, routing, basic limits, and capabilities were stable at the top level. Important
non-pricing additions and removals included:

| Observed transition            | Field                                            |
| ------------------------------ | ------------------------------------------------ |
| Removed after 2025-11-18       | `max_prompt_images`                              |
| Added 2025-11-11               | `deprecation_date`                               |
| Added 2026-03-24               | `supported_video_parameters`                     |
| Added from 2026-04-01          | `allowed_passthrough_parameters`                 |
| Added 2026-06-11 to 2026-06-19 | capacity, privacy, image, and passthrough fields |
