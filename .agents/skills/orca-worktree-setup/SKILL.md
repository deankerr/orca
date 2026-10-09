---
name: orca-worktree-setup
description: Set up a fresh linked Git worktree that needs its own Convex backend or running web app. Use when the task establishes this need; reuse configured checkouts.
---

# ORCA worktree setup

Run from the worktree root with an authenticated Convex CLI and Portless available.
Each worktree uses its own dev deployment in `deankerr:orca-b8162`.

## Create the deployment

Install dependencies if needed:

```sh
bun install --frozen-lockfile
```

Choose a unique task slug and an expiration suited to the task, then create/select its deployment:

```sh
bun run --cwd packages/backend convex deployment create \
  deankerr:orca-b8162:dev/<task> --type dev --expiration '7 days' --select
bun run --cwd packages/backend dev --once
```

## Configure the web app

If running the web app, write `apps/web/.env.local`:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | This worktree's backend `CONVEX_URL` |
| `WORKOS_CLIENT_ID` | Selected backend's managed AuthKit client |
| `WORKOS_API_KEY` | Selected backend's managed AuthKit credential |
| `WORKOS_COOKIE_PASSWORD` | At least 32 random characters |

Obtain WorkOS values from the backend `.env.local` or `convex env get` run from `packages/backend`.
Capture secrets directly into the ignored web env file. Portless supplies the callback URL.

Start `bun run dev:web`, `bun run dev:backend`, or `bun run dev` as needed. For populated views,
run ingestion with a recent `start_at` as described in `docs/orca/development-data.md`.

Verify the task's flow and report the deployment, expiration, app URL, and running processes.
