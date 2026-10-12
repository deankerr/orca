# Development data

Run from `packages/backend`. The new ingestion runner bootstraps the core rewrite
from existing captures. One capture establishes baseline state; subsequent captures
produce observed changes.

```sh
# Fresh timeline: select the first capture on or after a recent date.
bunx convex run --deployment '<dev-deployment>' ingestionNew/run:enqueueNextInput '{"start_at":"<YYYY-MM-DD>"}'

# Existing timeline: catch up from its current position.
bunx convex run --deployment '<dev-deployment>' ingestionNew/run:enqueueNextInput '{}'
```

`start_at` accepts an ISO date or timestamp with an offset. It requires a fresh
timeline and at least one capture at or after that time. Once an input is registered,
omit `start_at` to resume, including after partial baseline failure.

Without `start_at`, a fresh manual replay begins at the earliest source history.
Replay continues in the background until caught up. Preview initialization applies
the two-day starting window recorded in `config.md` to the new runner and resumes
any existing input, even when its baseline has not completed.

The new projections are available in `catalog_*` tables and their progress and clock
through `ingestionNew/state:latest` and `ingestionNew/state:clock`. Product readers
still use legacy tables; this bootstrap does not populate them.
