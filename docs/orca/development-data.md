# Development data

The runner derives Catalog from retained captures. Use the worktree's deployment and keep its object
source fixed for the timeline. Shared-source reads and local writes are configured independently in
`config.md`; newly collected local captures are not read while a remote source is selected.

Run from `packages/backend`:

```sh
# Fresh timeline: first capture at or after the selected date.
bunx convex run ingestion/register:next '{"start_at":"<YYYY-MM-DD>"}' --deployment <dev-deployment>

# Resume pending work or continue an existing timeline.
bunx convex run ingestion/register:next '{}' --deployment <dev-deployment>

# Inspect the latest registration and completed horizon.
bunx convex run ingestion/state:latest '{}' --deployment <dev-deployment>
bunx convex run ingestion/state:clock '{}' --deployment <dev-deployment>
```

`start_at` accepts an ISO date or offset-bearing timestamp and requires a fresh timeline plus an available
capture at or after it. Omit it after any registration, including a partially completed baseline. A fresh
manual invocation without it begins at the earliest available capture.

One capture establishes baseline state; continuation runs in the background until caught up. Preview
initialization uses the recent-history window in `config.md` or resumes an existing timeline. It does
not collect source captures. Keep automatic Discord sending disabled for silent replay.
