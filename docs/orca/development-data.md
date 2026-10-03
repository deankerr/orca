# Development data

Reuse an existing configured deployment when possible. New dev and preview deployments already
inherit the production object source, shared key, and app URLs from project defaults. Capture,
scheduled ingestion, and Discord broadcasting are disabled; no manual backend env setup is needed.

## Populate a dev deployment

Run from `packages/backend`. Choose the smallest replay window the task needs: two recent captures
suffice for the Grid; a few days are useful for Pricing History.

```sh
# Fresh deployment: choose a recent date with at least two available captures.
bunx convex run --deployment '<dev-deployment>' routine:run '{"start_at":"<YYYY-MM-DD>"}'

# Existing timeline: catch up without changing its baseline.
bunx convex run --deployment '<dev-deployment>' routine:run '{}'
```

Always provide `start_at` for a fresh manual replay; otherwise it starts from the earliest source
history. Replay continues in the background until caught up. Preview deployments initialize
automatically with a two-day window.

## Connect the web app

Set `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local` to the destination deployment's cloud URL,
then run `bun run dev:web` from the repository root.
