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
   bun run --cwd packages/backend dev --once
   ```

   New dev deployments inherit the shared **Previews** WorkOS environment from the
   project's dev defaults, as does the main checkout's personal dev deployment. Keep
   those credentials; do not copy the main checkout's env files or provision another
   auth environment. The backend `dev` script
   supplies `PORTLESS_URL` using `portless get orca`, including the worktree prefix,
   so Convex registers the correct callback. Run it with access to the existing Portless
   proxy state. For a direct `convex run --push`, supply that same `PORTLESS_URL`.

4. Only if running the web app, set `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local`
   to the new `CONVEX_URL` in this worktree's `packages/backend/.env.local`.
   Copy the main checkout's `NEXT_PUBLIC_POSTHOG_KEY` only if needed.

   Configure web auth using `WORKOS_CLIENT_ID` and `WORKOS_API_KEY` from this worktree's
   backend `.env.local`. If the noninteractive CLI did not write them, retrieve those
   two variables from this worktree's deployment with `convex env get`, capturing the
   output directly into the ignored env file without printing secrets. Generate a
   fresh `WORKOS_COOKIE_PASSWORD` of at least 32 random characters for this web app.
   Portless supplies the callback origin to Next.js at startup; never copy the main
   checkout's fixed redirect URL. See `docs/orca/admin-access.md` for test identity
   setup and the separate per-deployment admin allowlist.

   Routine development stays anonymous. If the task needs admin mode, read the main
   checkout's ignored `.env.auth.local` and sign in at this worktree's `/admin` using
   `ORCA_DEV_ADMIN_EMAIL` and `ORCA_DEV_ADMIN_PASSWORD`. Never print the password or
   copy this file into the worktree. Sign out from the account menu when finished.
   If credentials are missing, the one-time `bun run auth:setup` command belongs in
   the main checkout; do not create another account per worktree.

5. Start only the processes the task needs: `bun run dev:web` for the frontend,
   `bun run dev:backend` to watch backend edits, or `bun run dev` for both.
   The one-time backend deployment above is enough when no backend edits are planned.

## Data, when the task needs it

Do not seed data as an initial setup step. First understand the change and what data its
implementation or verification needs; some tasks need no populated data at all.

When data is needed, follow `docs/orca/development-data.md` and choose the smallest
source-backed replay window that serves the task. Two recent captures suffice for the grid.
Initialize a fresh timeline with an explicit `start_at`; resume an existing timeline without it.

## Verify and hand off

Verify the flow the task needs. For a populated grid, finish the replay checks in the data guide
and confirm the grid renders and filtering works in the browser.

Report the deployment, expiration, app URL, running processes, and verification result.
Deployment expiration leaves the local environment files pointing at the expired backend;
reconfigure them when setting up its replacement.
