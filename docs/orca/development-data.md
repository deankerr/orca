# Development data

Run from `packages/backend`. Two recent captures suffice for the Grid; a few days
are useful for Pricing History.

```sh
# Fresh deployment: choose a recent date with at least two captures.
bunx convex run --deployment '<dev-deployment>' ingest:run '{"start_at":"<YYYY-MM-DD>"}'

# Existing timeline: catch up from its current position.
bunx convex run --deployment '<dev-deployment>' ingest:run '{}'
```

Without `start_at`, a fresh manual replay begins at the earliest source history.
Replay continues in the background until caught up. Preview deployments initialize
with a two-day window.
