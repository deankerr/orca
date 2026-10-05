---
name: orca-worktree-setup
description: Set up a fresh linked Git worktree that needs its own Convex backend or running web app. Use when the task establishes this need; reuse configured checkouts.
---

# ORCA worktree setup

Run from the worktree root with an authenticated Convex CLI and Portless available.
Each worktree uses its own dev deployment in `deankerr:orca-b8162`.

1. Install dependencies if needed:

   ```sh
   bun install --frozen-lockfile
   ```

2. Choose a unique task slug and create/select its deployment. Adjust expiration to
   suit the task:

   ```sh
   bun run --cwd packages/backend convex deployment create \
     deankerr:orca-b8162:dev/<task> --type dev --expiration '7 days' --select
   bun run --cwd packages/backend dev --once
   ```

3. If running the web app, write `apps/web/.env.local`:
   - `NEXT_PUBLIC_CONVEX_URL`: this worktree's backend `CONVEX_URL`.
   - `WORKOS_CLIENT_ID` and `WORKOS_API_KEY`: from its backend `.env.local`, or retrieve
     with `convex env get` from `packages/backend`.
   - `WORKOS_COOKIE_PASSWORD`: generate at least 32 random characters.

   Capture secrets directly into the ignored env file. Portless supplies the callback URL.

4. Start `bun run dev:web`, `bun run dev:backend`, or `bun run dev` as needed.

For populated views, sync from a recent date. Two captures suffice for the grid:

```sh
bun run --cwd packages/backend convex run ingest:run '{"start_at":"<YYYY-MM-DD>"}'
```

Verify the task's flow and report the deployment, expiration, app URL, and running
processes.
