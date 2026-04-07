# Slugs

This note captures slug-related structure and behavior that is easy to forget, and which is not always obvious from the code alone.

## Core Idea

Treat slugs as structured identifiers, not as free text.

They are usually the most stable and most precise identifiers in the system. The same questions come up repeatedly around which slug to use, how variants relate to their parent entity, and how punctuation should be interpreted.

## Model Slugs

- `model.slug` is the canonical model identifier in the system.
- `model.slug` may include a variant suffix after `:`.
- Variant suffixes are part of the main model slug.

Examples:

- `openai/gpt-oss-120b`
- `openai/gpt-oss-120b:free`
- `anthropic/claude-3.7-sonnet:thinking`

### Model Variants

Known examples of model variant suffixes include:

- `free`
- `thinking`
- `exacto`

Important behavior:

- Variant-suffixed model slugs are considered different models in our system.
- They can have completely different endpoints.
- They can also have a different display name.

### Base Slug

- `model.base_slug` links related model variants together.
- `model.base_slug` is the model slug without the variant suffix.

Example:

- `model.slug = openai/gpt-oss-120b:free`
- `model.base_slug = openai/gpt-oss-120b`

In the current snapshot:

- about `90%` of models have `model.slug === model.base_slug`
- this means most models are effectively the standard, unsuffixed variant

### Version Slug

- `model.version_slug` is often equal to `model.slug`, but not always.
- it is worth treating as a distinct identifier field

### Author Slug

- `author_slug` is derivable from `model.slug`
- specifically, it is the first segment before `/`

Example:

- `anthropic/claude-opus-4.6` -> `author_slug = anthropic`

## Provider Slugs

- `provider.slug` identifies the provider entity.
- `provider.tag_slug` is a provider identifier plus an optional tag suffix.
- unlike model variants, provider tag suffixes do not have a clear shared semantic model
- provider tag suffixes are opaque, unbounded variant suffixes
- they vary heavily by provider
- they cannot be linked or grouped in any general way
- provider tags are only found as part of endpoints
- there is no central registry of provider tags

Important distinction:

- `provider.slug` and `provider.tag_slug` can refer to the same provider entity
- when a tag suffix exists, it identifies a provider-specific endpoint grouping, not a different provider entity

Example:

- `google-vertex` and `google-vertex/europe` are the same provider entity
- they matter because one provider can expose many endpoints for the same model under different tags

In the current snapshot:

- about `43%` of endpoint `provider.tag_slug` values are equal to `provider.slug`

### Known Provider Tag Examples

DeepInfra:

- `provider_slug = deepinfra`
- known `provider_tag_slug` values:
  - `deepinfra`
  - `deepinfra/bf16`
  - `deepinfra/fp8`
  - `deepinfra/fp4`
  - `deepinfra/turbo`
  - `deepinfra/base`
  - `deepinfra/fp32`

xAI:

- `provider_slug = xai`
- known `provider_tag_slug` values:
  - `xai`
  - `xai/fast`

Xiaomi:

- `provider_slug = xiaomi`
- known `provider_tag_slug` values:
  - `xiaomi/fp8`
- note: this was observed only with a tag suffix, not as plain `xiaomi`

Google Vertex:

- `provider_slug = google-vertex`
- known `provider_tag_slug` values:
  - `google-vertex`
  - `google-vertex/global`
  - `google-vertex/europe`
  - `google-vertex/us-east5`
  - `google-vertex/us`

## Confirmed Search Semantics

These are the rules we explicitly converged on for endpoint-grid search.

- Search currently focuses on slug-like fields, not name fields.
- The useful endpoint-grid fields are:
  - `model.slug`
  - `model.version_slug`
  - `provider.tag_slug`
- Query tokens are split on whitespace only.
- Query punctuation is preserved inside each token.
- The characters `/`, `-`, and `:` are meaningful inside slugs.
- For search indexing, `/`, `-`, and `:` act as boundary characters.
- For query matching, those same characters are treated as normal characters inside a token.
- `.` is part of the slug word and is not treated as a separator.
- Prefix matching is the core behavior.

Examples we explicitly verified:

- `gpt-4` matches `openai/gpt-4` and longer slug prefixes like `openai/gpt-4-turbo`
- `gpt-4-` matches hyphenated continuations like `openai/gpt-4-0314` and `openai/gpt-4-turbo`
- `google-vertex` matches both the base tag and variant tags such as `google-vertex/global`
- `google-vertex/` matches only slash-suffixed variants
- `google-vertex/g` narrows to `google-vertex/global`
- `openai/gpt-oss-20b:` matches variant-suffixed slugs such as `openai/gpt-oss-20b:free`

## Useful Search Mental Model

Each indexed slug contributes:

- the full slug
- suffixes that begin immediately after `/`, `-`, or `:`
- the plain segments between those boundaries

Examples:

- `openai/gpt-4-turbo` contributes tokens including:
  - `openai/gpt-4-turbo`
  - `gpt-4-turbo`
  - `4-turbo`
  - `turbo`
  - `openai`
  - `gpt`
  - `4`
- `google-vertex/global` contributes tokens including:
  - `google-vertex/global`
  - `global`
  - `google`
  - `vertex`

This is why a query can preserve punctuation and still match naturally by prefix.

## Things We Intentionally Stopped Doing

- no typo tolerance
- no transposed-letter matching
- no numeric alias expansion like treating `4.6` as a special version family beyond normal prefix behavior
- no name-field search in the current endpoint-grid search path
- no field weighting in ranking

## Open Questions

- none currently captured here
