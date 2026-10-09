# Endpoint-grid slug search

Search targets model slugs and provider tags, preserving punctuation that users copy into code.
Display names, fuzzy matching, typo correction, and numeric aliases are outside its scope.

Every whitespace-separated query token must match, but tokens can match different fields of an
endpoint. `google-vertex/` requires a suffixed tag, while `google-vertex` can match the base or a
variant. `/`, `-`, and `:` create index boundaries; `.` remains part of a word. Prefix matching
supports narrowing as the user types.
