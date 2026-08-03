# Historical text schema: first pass

> Diagnostic appendix, not the implementation backlog. The active product-facing direction is
> [core-workflow.md](core-workflow.md). Long-tail fields remain out of scope until deliberately
> promoted for a concrete consumer.

Exploratory result from the complete production Convex export, filtered to endpoint observations
whose embedded model has exactly `output_modalities = ["text"]`.

This is evidence for the first historical decoder, not a final canonical model. The recent strict
reference schemas in `packages/schema/src/reference/` remain untouched.

## Corpus and method

- 19,245 crawls from 2025-08-13 20:07 UTC through 2026-08-01 13:30 UTC.
- 15,691,012 successful text-endpoint observations.
- 5,848,363 model observations after per-crawl natural-key deduplication.
- 85 model-scope endpoint fetch failures; these were counted as failures and never interpreted as
  empty endpoint sets.
- Zero malformed model or endpoint records at the minimal traversal boundary.
- Eight crawls had no successfully observed text entities, so field absence was not inferred from
  them.

The scan runs oldest to newest. For every raw path it records JSON types, examples, first/last
observation, and contiguous absent/partial/universal intervals. It also records top-level key-set
signatures. The reproducible report is `.archive-work/analysis/schema-observations.json` (ignored by
Git), produced by:

```bash
bun run archive scan
```

The full scan found 45 top-level model fields and 63 top-level endpoint fields. Nested structures
expand that to 82 and 638 paths respectively, mostly because endpoint telemetry evolves frequently.
There are 18 model and 224 endpoint top-level signatures, but those counts substantially overstate
meaningful schema eras: sparse fields, status telemetry, and rolling deployments create many
combinations.

## Entity boundary

The raw endpoint repeats a full `model` and `provider_info`. The model repeats a small `endpoint`
scope. Those are upstream denormalized copies, not three new entities.

The first historical materialization should normalize at this boundary without renaming fields:

- model records: the raw model fields, with the embedded `endpoint` scope removed;
- endpoint records: the raw endpoint fields, with embedded `model` and `provider_info` removed;
- provider records can be addressed separately when provider history enters scope;
- retain upstream natural identifiers (`slug`, `permaslug`, `id`, `model_variant_slug`,
  `provider_name`, and so on) under their original names.

As in `bundles.md`, deduplicate within a crawl by natural key and assert that repeated copies agree.
Do not copy model/provider properties into an endpoint projection, and do not perform the Convex
materializer's field renames.

## Stable historical core

These top-level fields were universal in every crawl with text data from the beginning through the
end. Their values may still be nullable, and nested objects need their own schemas.

### Model

```text
author, context_length, created_at, default_stops, default_system, description, features, group,
has_text_output, hf_slug, hf_updated_at, hidden, input_modalities, instruct_type,
model_version_group_id, name, output_modalities, permaslug, reasoning_config, router, short_name,
slug, updated_at, warning_message
```

### Endpoint

After removing the embedded `model` and `provider_info` entity copies, the stable endpoint core is:

```text
adapter_name, can_abort, context_length, data_policy, features, has_chat_completions,
has_completions, id, is_byok, is_deranked, is_disabled, is_free, is_hidden, limit_rpd, limit_rpm,
limit_rpm_cf, max_completion_tokens, max_prompt_tokens, max_tokens_per_image,
model_variant_permaslug, model_variant_slug, moderation_required, name, pricing,
provider_display_name, provider_model_id, provider_name, provider_region, provider_slug,
quantization, supported_parameters, supports_multipart, supports_reasoning,
supports_tool_parameters, variant
```

This core is the right required-field baseline. Everything below should be declared explicitly as
historical optionality rather than made silently optional through a loose object schema.

## Model story: additive and tractable

The model surface is predominantly additive. Most introductions have one partially deployed crawl
followed by universal presence, which is useful evidence but not a durable schema era of its own.

| First observed (UTC) | Fields introduced                                                            |
| -------------------- | ---------------------------------------------------------------------------- |
| 2025-09-15 / 17      | `default_parameters`; then `default_order`, `promotion_message`              |
| 2025-11-03 / 06      | `quick_start_example_type`; then `is_trainable_image`, `is_trainable_text`   |
| 2025-11-25           | `routing_error_message`                                                      |
| 2025-12-16           | `supports_reasoning`                                                         |
| 2026-03-25           | `knowledge_cutoff`                                                           |
| 2026-04-03 / 19      | `author_display_name`; then `limit_rpd`, `limit_rpm`, `supported_tts_voices` |
| 2026-05-06           | `is_private` (and temporary, always-null `owner_clerk_user_id`)              |
| 2026-07-15 / 22 / 24 | `preview_thumbnail_url`, `required_attestation_types`, `preview_audio`       |
| 2026-07-27 / 31      | `author_flagship_modalities`, `previews_by_modality`; then `author_icon_uri` |

Recommendation: one strict historical model schema made from the stable core plus named optional
additions. Keep types faithful (`null` is not absence). Era assertions can say when an additive field
should be present, but separate decoder schemas for every introduction would add machinery without
improving value fidelity.

## Endpoint story: core plus evolving carriers

Endpoint identity, routing, basic limits, capability booleans, and `pricing` remain stable. Most
schema churn is one of:

1. additive configuration fields;
2. pricing representations replacing one another;
3. embedded telemetry that should not define the entity schema.

Important top-level transitions:

| First observed (UTC) | Last observed (UTC) | Field/change                                             |
| -------------------- | ------------------- | -------------------------------------------------------- |
| start                | 2025-11-18          | `max_prompt_images` (removed)                            |
| 2025-11-11           | end                 | `deprecation_date`                                       |
| 2025-12-22           | end                 | `pricing_json` (gradual adoption)                        |
| 2026-01-10           | end                 | `pricing_version_id`                                     |
| 2026-02-10           | 2026-04-01          | temporary `line_items`                                   |
| 2026-03-24           | end                 | `supported_video_parameters`                             |
| 2026-04-01           | end                 | `allowed_passthrough_parameters`, then `display_pricing` |
| start                | 2026-04-17          | `variable_pricings` (removed)                            |
| 2026-05-06           | end                 | `is_private` (plus temporary `owner_clerk_user_id`)      |
| 2026-06-11           | end                 | `capacity_tpm`                                           |
| 2026-06-17           | end                 | `created_at`, `excluded_parameters`                      |
| 2026-06-19           | end                 | `is_byok_only`, `supported_image_parameters`             |
| 2026-07-09           | end                 | sparse `tiers`                                           |

Recommendation: one strict historical endpoint schema with the stable core and explicit optional
fields is also viable. In that schema:

- decode `stats`, `statsByTier`, status/routing heuristic objects, and the temporary `fortuna` object
  as opaque retained values; their hundreds of nested paths are telemetry, not endpoint structure;
- retain `pricing_json`, `display_pricing`, and `tiers` opaquely for now, as requested;
- model the basic `pricing` field carefully under its original names;
- represent removed and temporary fields explicitly, with comments and observed date ranges.

### Pricing eras for diagnostics

The compatibility decoder need not be a date-discriminated union, because deployments overlap and
`pricing_json` adopted gradually. Validation and analysis should nevertheless label four pricing
eras:

1. **Legacy** (start → 2025-12-22): `pricing` plus `variable_pricings`.
2. **Versioned transition** (2025-12-22 → 2026-04-01): gradual `pricing_json`, then
   `pricing_version_id`; temporary `line_items` from 2026-02-10.
3. **Display transition** (2026-04-01 → 2026-07-09): `display_pricing` arrives and
   `variable_pricings` disappears on 2026-04-17.
4. **Tiered** (2026-07-09 → end): sparse `tiers`; `pricing.overrides` appears on 2026-07-13.

The basic `pricing` object is present throughout. Its price values are decimal strings; `discount`
is numeric. Keys appear and disappear over time, so it should be a strict object with named optional
keys rather than a field-renamed projection. Notable historical keys include `prompt`, `completion`,
`image`, `image_output`, `request`, `web_search`, `internal_reasoning`, `input_cache_read`,
`input_cache_write`, `input_cache_write_1h`, `audio`, `audio_output`, `input_audio_cache`,
`line_items`, `display_pricing`, and `overrides`.

## Proposed schema layering

The next implementation pass should create schemas beside—not inside—the recent reference schemas:

1. **Bundle traversal schema**: loose and minimal; validates only `crawl_id`, `data.models`, model
   scope, and endpoint-array-versus-fetch-error distinction.
2. **Historical raw entity schemas**: strict model/endpoint boundaries using the stable cores and
   explicit historical optionals, preserving names and nullability.
3. **Pricing-era classifiers**: diagnostics over successfully decoded endpoints, not alternate
   canonical records.
4. **Materializer**: separates embedded copies, asserts duplicate equality, filters exactly
   `["text"]`, and emits normalized model/endpoint records without renaming fields.

This gives one value-faithful compatibility story for the whole archive while retaining enough era
information to catch false assumptions. It avoids both bad extremes: forcing the recent API schema
onto old data, and making every field optional in one uninformative loose object.

## Open follow-ups

- Enumerate the full `pricing` key set and validate each key's type and presence intervals.
- Verify repeated model copies are value-identical after removing the embedded `endpoint` scope over
  the complete corpus, not just recent captures.
- Decide whether the endpoint's redundant `name` is retained in raw entities or documented as a
  derivable drop later; do not drop it in the historical decoder.
- Add provider history only after its identity boundary is explicitly in scope.
- Treat the one-crawl partial introductions and brief `created_at`/`excluded_parameters` absence as
  rolling deployment observations, not standalone schema versions.
