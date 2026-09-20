# Text feed

A text-first consumer of the durable change-event history.

- `http.ts` serves Markdown at `/ces/feed` and full-event JSON at `/ces/events/<id>`.
- `markdown.ts` groups the document by as-of time, then model, with standalone provider sections.
- Model changes precede endpoint changes within each model section, even when input order differs.
- Model headings pair display names with `model_id`; provider headings use endpoint `provider_tag`
  or standalone `provider_id`.
- `markdown/entity.ts` displays lifecycle summaries and combines updates under one entity heading.
- `markdown/fields.ts` formats known fields and literal diffs using historical evidence.
- Different operations render as separate entries, including conflicting operations for one entity.
- Known prices, discounts, names, and curated metadata use prose with readable field labels.
- String-array updates list added and removed entries; unfamiliar event fields use literal diffs.
- Code formatting preserves underscores, brackets, and boolean values without Markdown escaping.
- Event retrieval uses `changeEvents/events.ts`; rendering uses its public payload schemas.
- The feed shows one bounded recent window in observation order, newest first; time groups may be partial.
