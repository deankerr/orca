---
name: orca-worktree-setup
description: Set up a fresh linked Git worktree when the task needs its own Convex backend or running web app. Use only when the task context already establishes that this is a new worktree needing setup. Do not use for ordinary session startup, the regular main checkout, an already-configured worktree, or tasks that need no backend. Do not perform worktree checks merely to decide whether to use this skill.
---

# ORCA worktree setup

Run from the fresh worktree's repository root. Use the already-authenticated Convex CLI;
project environment defaults are configured.

1. Install dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

2. Find the main checkout with `git worktree list --porcelain`. Read the team and project
   metadata from its `packages/backend/.env.local` without modifying or copying that file.
   If unavailable, ask for the team/project slugs. Authentication alone does not tell the
   CLI which project a fresh checkout belongs to.

3. Choose a unique task slug and create/select an expiring dev deployment, substituting
   the discovered team and project:

   ```sh
   bun run --cwd packages/backend convex deployment create \
     <team>:<project>:dev/<task> --type dev --expiration 'in 7 days' --select
   bun run --cwd packages/backend convex dev --once
   ```

4. If the task needs populated data:

   ```sh
   bun run --cwd packages/backend convex run v3/pull:run '{}'
   ```

5. Only if running the web app, set `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local`
   to the new `CONVEX_URL` in this worktree's `packages/backend/.env.local`.
   Copy the main checkout's `NEXT_PUBLIC_POSTHOG_KEY` only if needed.

6. Start only the processes the task needs: `bun run dev:backend`, `bun run dev:web`,
   or `bun run dev` for both.
