# Change Event Streams

See the [concepts and design philosophy](../../../../../docs/orca/change-event-streams.md).

## Index

- `consume.ts`: ingestion entry point for a shared comparison.
- `ingestion/`: contextual chunk preparation and durable acceptance.
- `processing/`: stateful rules and traversal of unfinished jobs.
- `presentation/`: request-time Markdown and full-event JSON.
- `entityChange.ts`: job payloads and the initial concrete event format.
- `dev.ts`: development reset actions.

## Operating notes

- `v3/ingest.ts` is the ordinary source of comparisons and advances the shared scan cursor after acceptance.
- Ordinary ingestion schedules a continuing action chain unless invoked with `once: true`.
- Processing is invoked separately from ingestion.
- Run at most one ingestion chain and one processor, and let both finish before resetting CES.
- Reset discards the experiment; completed jobs are never reopened during normal processing.
- A completed batch exposes its jobs to processing; ingestion retries require unchanged extraction rules.
- The first scan establishes a baseline; resetting CES does not rewind ordinary scan ingestion.

The development [Markdown feed](https://fantastic-mosquito-881.convex.site/ces/feed) links to full events.
