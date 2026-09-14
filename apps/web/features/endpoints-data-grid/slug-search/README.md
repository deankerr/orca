# Endpoint-grid slug search

## Integration

[`slug-search.ts`](./slug-search.ts) exports `createSlugSearcher(records, { getFields, compareItems })`. It builds an in-memory index and returns a `search(query)` function producing ranked `{ record, score }` results. Tests live in [`slug-search.test.ts`](./slug-search.test.ts).

The grid caller in [`../endpoints-data-grid.tsx`](../endpoints-data-grid.tsx) searches the facet-filtered endpoints using two v3 fields:

- `model_id`
- `provider_tag`

The grid bypasses search for a blank query. The searcher's own blank-query behavior returns all indexed records in their original order with a score of zero.

## Matching

- Search currently focuses on slug-like fields, not name fields.
- Indexed values and queries are lowercased, normalized with Unicode NFKC, and have whitespace collapsed and trimmed.
- Query tokens are split on whitespace only.
- Every query token must match; tokens can match across different indexed fields of the same endpoint.
- Query punctuation is preserved inside each token.
- The characters `/`, `-`, and `:` are meaningful inside slugs.
- For search indexing, `/`, `-`, and `:` act as boundary characters.
- For query matching, those same characters are treated as normal characters inside a token.
- `.` is part of the slug word and is not treated as a separator.
- Prefix matching is the core behavior.

Examples:

- `gpt-4` matches `openai/gpt-4` and longer slug prefixes like `openai/gpt-4-turbo`
- `gpt-4-` matches hyphenated continuations like `openai/gpt-4-0314` and `openai/gpt-4-turbo`
- `google-vertex` matches both the base tag and variant tags such as `google-vertex/global`
- `google-vertex/` matches only slash-suffixed variants
- `google-vertex/g` narrows to `google-vertex/global`
- `openai/gpt-oss-20b:` matches variant-suffixed slugs such as `openai/gpt-oss-20b:free`

## Index tokens

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

## Ranking

Results are ordered by:

1. Whether the entire normalized query exactly matches an indexed field.
2. Number of exact token matches.
3. Number of prefix token matches.
4. The caller's `compareItems` function, then original record position for remaining ties.

The grid's tie-breaker uses `model_or_created_at` descending, then `model_id` and `provider_tag` lexically. Explicit table sorting is applied separately by the grid.

For each query token, the searcher prefers an exact token match over a prefix match, then the shorter matching token, then lexical order. The returned score encodes the ranking buckets for observability; the comparator orders the buckets directly.

## Intentional exclusions

- no typo tolerance
- no transposed-letter matching
- no numeric alias expansion like treating `4.6` as a special version family beyond normal prefix behavior
- no name-field search in the current endpoint-grid search path
- no field weighting in ranking
