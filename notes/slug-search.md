# Endpoint-grid slug search

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
