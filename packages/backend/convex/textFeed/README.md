# Text feed

A text-first consumer of the durable change-event history.

- `http.ts` serves Markdown at `/ces/feed` and full-event JSON at `/ces/events/<id>`.
- `markdown.ts` renders events using historical context and exposes unsupported formats as JSON.
- Event retrieval uses `changeEvents/events.ts`; rendering uses its public payload schemas.
- The feed shows one bounded recent window in event creation order, newest first.
