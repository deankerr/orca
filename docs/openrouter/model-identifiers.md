# Model identifiers

OpenRouter exposes several related model identifiers. They should be treated as structured values,
not interchangeable labels.

## Slug

`slug` identifies the current model, for example `openai/gpt-oss-120b`. Its first path segment is
the author slug: `openai` in this example.

A colon suffix identifies a model variant in observation scopes and endpoint identifiers:

- `openai/gpt-oss-120b:free`
- `anthropic/claude-3.7-sonnet:thinking`

Observed variant suffixes include `free`, `thinking`, and `exacto`. A variant can have different
endpoints and a different display name from its unsuffixed model. The bare slug represents the
standard variant.

⚠️ The embedded `model.slug` identifies the base model. Variant identity is carried by endpoint
fields such as `model_variant_slug`, not by a separate variant model record.

## Permaslug

`permaslug` is the versioned identifier, such as `openai/gpt-5.2-20251211`. It may equal `slug`, so
equality does not imply that the two fields have the same semantics.

For an endpoint observation, `model_variant_slug` and `model_variant_permaslug` identify the exact
variant being offered. Non-standard variants append the variant suffix to the corresponding model
identifier.

## Aliases

Catalog slugs beginning with `~`, such as `~openai/gpt-latest`, are router aliases rather than
concrete model identifiers. Their permaslugs do not yield endpoints.
