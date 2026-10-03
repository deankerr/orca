# Endpoint-grid slug search

Search is for model slugs and provider tags, preserving the punctuation users copy into code.
It deliberately excludes fuzzy matching, typo correction, numeric aliases, and display-name search.

Every whitespace-separated query token must match, but tokens can match different fields of an
endpoint. Queries retain punctuation: `google-vertex/` requires a suffixed tag, while
`google-vertex` can match the base or a variant. `/`, `-`, and `:` create index boundaries;
`.` remains part of a word. Prefix matching supports narrowing naturally as the user types.

The implementation and tests own normalization, indexing, ranking, and tie-breaking details.
