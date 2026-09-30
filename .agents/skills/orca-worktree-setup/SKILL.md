---
name: orca-worktree-setup
description: Set up a fresh linked Git worktree when the task needs its own Convex backend or running web app. Use only when the task context already establishes that this is a new worktree needing setup. Do not use for ordinary session startup, the regular main checkout, an already-configured worktree, or tasks that need no backend. Do not perform worktree checks merely to decide whether to use this skill.
---

# ORCA worktree setup

Run from the fresh worktree's repository root. Use the already-authenticated Convex CLI;
project environment defaults are configured. Setup belongs to the worktree, not the session:
reuse an already-configured checkout and its running processes, including in the main repository.

1. Install dependencies if needed:

   ```sh
   bun install --frozen-lockfile
   ```

2. Find the main checkout with `git worktree list --porcelain`. Read the team and project
   metadata from its `packages/backend/.env.local` without modifying or copying that file.
   If unavailable, ask for the team/project slugs. Authentication alone does not tell the
   CLI which project a fresh checkout belongs to.

3. Choose a unique task slug and an expiration suited to the task: a few hours for a drill,
   seven days for ongoing work. Create/select the dev deployment, substituting the discovered
   team and project and chosen lifetime:

   ```sh
   bun run --cwd packages/backend convex deployment create \
      <team>:<project>:dev/<task> --type dev --expiration '<lifetime>' --select
   bun run --cwd packages/backend convex dev --once
   ```

4. Only if running the web app, set `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local`
   to the new `CONVEX_URL` in this worktree's `packages/backend/.env.local`.
   Copy the main checkout's `NEXT_PUBLIC_POSTHOG_KEY` only if needed.

5. Start only the processes the task needs: `bun run dev:web` for the frontend,
   `bun run dev:backend` to watch backend edits, or `bun run dev` for both.
   The one-time backend deployment above is enough when no backend edits are planned.

## Data, when the task needs it

Do not seed data as an initial setup step. First understand the change and what data its
implementation or verification needs; some tasks need no populated data at all.

When data is needed, follow `docs/orca/v4-development-data.md` and choose the smallest
source-backed replay window that serves the task. Two recent captures suffice for the grid.
Initialize a fresh timeline with an explicit `start_at`; resume an existing timeline without it.

## Verify and hand off

Verify the flow the task needs. For a populated grid, finish the replay checks in the data guide
and confirm the grid renders and filtering works in the browser.

Report the deployment, expiration, app URL, running processes, and verification result.
Deployment expiration leaves the local environment files pointing at the expired backend;
reconfigure them when setting up its replacement.
