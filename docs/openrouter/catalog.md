# Catalog

OpenRouter's frontend catalog is a list of model records plus a per-model endpoint page. Catalog membership is not evidence that a model can currently serve inference.

## Model list

`GET https://openrouter.ai/api/frontend/v1/catalog/models` returns historical records as well as currently available models.

- A catalog model with a nested `endpoint` object has at least one queryable inference endpoint.
- A catalog model whose `endpoint` is `null` has no current inference endpoint.
- 📊 On 2026-07-24 the catalog contained 815 model records; 374 had no endpoints, including long-retired models.

## Endpoint pages

Endpoint rows for one model variant are fetched from the stats endpoint, not from the catalog list.

- `GET https://openrouter.ai/api/frontend/v1/stats/endpoint?permaslug={permaslug}&variant={variant}`
- `permaslug` is the catalog model's `permaslug`.
- `variant` is the nested catalog `endpoint.variant` (`standard` when the slug has no variant suffix).
- A `404` for a concrete model means there are no endpoints now, not that the model is unknown.
- ⚠️ Latest aliases (`~` slugs) also `404` here even though the catalog row carries a nested `endpoint`. See [Latest aliases](#latest-aliases).

## Identifiers

OpenRouter exposes several related identifiers. They are structured values, not interchangeable labels.

### `slug`

`slug` identifies the current model, for example `openai/gpt-oss-120b`.

- The first path segment is the author slug (`openai` in that example).
- A colon suffix names a variant in observation scopes and endpoint identifiers: `openai/gpt-oss-120b:free`, `anthropic/claude-3.7-sonnet:thinking`.
- Observed variant suffixes include `free`, `thinking`, and `exacto`.
- The unsuffixed slug is the standard variant.
- ⚠️ The nested `model.slug` on an endpoint payload identifies the base model. Variant identity is carried by endpoint fields such as `model_variant_slug`, not by a separate variant model record.

### `permaslug`

`permaslug` is the versioned identifier, such as `openai/gpt-5.2-20251211`.

- It can equal `slug`; equality does not mean the two fields have the same semantics.
- On an endpoint, `model_variant_slug` and `model_variant_permaslug` identify the variant being offered.
- Non-standard variants append the variant suffix to the corresponding model identifier.

## Latest aliases

Catalog slugs beginning with `~` are "latest" aliases that point at the current model of an author or of an author's series. They are not concrete model identifiers.

- Examples: `~openai/gpt-latest`, `~anthropic/claude-sonnet-latest`, `~z-ai/glm-latest`.
- `permaslug` is always identical to `slug` on these rows.
- ⚠️ The catalog model record is a projection of the targeted model and reflects that target inconsistently.
- ⚠️ The nested `endpoint` is also a projection, and its `id` is not a UUID.
- `/api/frontend/v1/stats/endpoint` for these rows always returns `404`.
- 🧭 Filter `~` slugs out of ORCA observations; they add no durable identity or endpoint inventory.

## Nested copies

Endpoint payloads repeat complete `model` and `provider_info` objects. The nested model can itself contain an endpoint scope.

- ⚠️ These are denormalized copies of the same conceptual entities, not additional identities.

## Catalog-wide rewrites

Large same-field changes across many records can be an upstream reporting transition rather than independent market events.

- Historical examples include catalog-wide data-policy changes and widespread quantization changes.
- Interpret those as a common rewrite, not as a separate change on every affected endpoint.
