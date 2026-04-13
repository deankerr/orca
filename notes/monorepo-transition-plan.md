# Monorepo Transition Plan

## Purpose

This plan covers the next structural PR for ORCA on the current production codebase:

1. Step 0: convert the repo to a Bun workspace monorepo while keeping the app as a single package under `apps/web`.
2. Step 1: break the Convex backend out of `apps/web` into its own workspace package.

This plan is intentionally narrow. It is about repository structure, tool configuration, and deployment/release continuity. It is not the place to redesign backend architecture or introduce new services yet.

## Confirmed External Constraints

- Bun workspaces use npm-style `"workspaces"` in the root `package.json`, and the field supports glob patterns. Use separate entries like `["apps/**", "packages/**"]`. Source: [Bun workspaces](https://bun.sh/docs/install/workspaces)
- Turborepo can be adopted incrementally in an existing repo, and `turbo.json` uses the `tasks` key. Source: [Add to an existing repository](https://turborepo.dev/repo/docs/getting-started/add-to-existing-repository), [turbo.json configuration](https://turborepo.dev/docs/reference/configuration)
- Vercel monorepos are configured by setting a project Root Directory to the app directory. For this repo, that means the existing Vercel project should point at `apps/web` once Step 0 lands. Source: [Using Monorepos](https://vercel.com/docs/monorepos), [Project settings](https://vercel.com/docs/projects/project-configuration/project-settings)
- `vercel.json` is expected at the deployed project root. After Step 0, the production app's `vercel.json` should live in `apps/web`. Source: [vercel.json](https://vercel.com/docs/project-configuration/vercel-json)
- Convex expects `convex.json` in the root of the local Convex project, in the same directory as that project's `package.json`. The Convex functions directory can be relocated with the `functions` field. Source: [Convex project configuration](https://docs.convex.dev/production/project-configuration)
- TypeScript supports `extends` for sharing config, but it is optional. We do not need project references or a shared tsconfig package in this PR. Source: [TSConfig `extends`](https://www.typescriptlang.org/tsconfig/#extends), [TSConfig `references`](https://www.typescriptlang.org/tsconfig/references.html)

## Repo-Specific Constraints

- `bun run check` must continue to run from the monorepo root.
- `oxlint` and `oxfmt` stay root-driven. We do not introduce per-package formatting or lint configs.
- The release system currently assumes:
  - version source of truth is the root `package.json`
  - `next.config.ts` imports `./package.json`
  - `scripts/release.ts` edits `package.json` at repo root
  - Vercel production deploys are gated via root `vercel.json`
- The current app uses `@/*` path aliasing, and that alias is resolved relative to the `tsconfig.json` file that declares it. Moving the existing app tsconfig into `apps/web` preserves the alias behavior in Step 0 without needing alias remapping.
- The current Convex setup has its own `convex/tsconfig.json`, and that environment should remain Convex-specific instead of being forced into a generic shared TypeScript setup.

## Target Layout

### After Step 0

```text
/
  package.json              # workspace root, private, orchestration only
  bun.lock
  turbo.json
  tsconfig.json             # root/editor convenience only, minimal
  .github/
  assets/
  notes/
  apps/
    web/
      package.json
      tsconfig.json
      next.config.ts
      vercel.json
      app/
      components/
      convex/
      hooks/
      lib/
      public/
      scripts/
      shared/
```

### After Step 1

```text
/
  package.json
  bun.lock
  turbo.json
  apps/
    web/
      package.json
      tsconfig.json
      next.config.ts
      vercel.json
      app/
      components/
      hooks/
      lib/
      public/
  packages/
    convex/
      package.json
      convex.json
      tsconfig.json         # Convex-specific config remains package-local
      convex/
      shared/ or src/       # only if needed by the backend package
```

The exact internal layout inside `packages/convex` can stay conservative. The important part is that Convex becomes its own workspace package with its own local project config.

## Decisions For This PR

### 1. Workspace root becomes orchestration-only

The root `package.json` should become the workspace root and stop pretending to be the deployable app package.

What stays at root:

- workspace declaration
- root scripts that orchestrate repo tasks
- root dev dependencies like `turbo`, `oxlint`, `oxfmt`, and TypeScript tooling
- CI, release notes, and repository-level docs

What moves to `apps/web`:

- the current deployable app package
- Next app code
- app-adjacent scripts
- current `vercel.json`
- current `next.config.ts`
- the current app `package.json`

### 2. Step 0 remains a single deployable app package

Step 0 is not the place to untangle imports or create internal libraries. The goal is to create the outer monorepo shell while keeping the moved app operational with minimal semantic change.

That means:

- preserve the current Next app structure inside `apps/web`
- preserve the current alias behavior by moving the existing app tsconfig with the app
- keep Convex co-located inside `apps/web` for the first step
- update root scripts to call into `apps/web`

### 3. Add Turborepo now, but keep it light

We should add `turbo` in this PR because:

- it is cheap to add once the workspace root exists
- it gives us a consistent root task runner immediately
- it sets up later multi-package work without further repo churn

Initial `turbo.json` should stay small:

- `build`
- `dev`
- `check`
- maybe `dev:next` / `dev:convex` only if that maps cleanly

No elaborate caching strategy is needed yet.

### 4. Do not over-engineer TypeScript sharing

For this PR:

- move the existing Next-specific `tsconfig.json` into `apps/web/tsconfig.json`
- add a new minimal root `tsconfig.json` for repo/editor tooling, with no path aliases
- no `packages/typescript-config` package
- no project references requirement
- when Convex moves, keep the Convex-specific tsconfig as the backend package's own tsconfig instead of trying to normalize it into a shared config story

### 5. Version and release ownership moves from repo root to `apps/web`

Once the app package moves to `apps/web`, the deployed app version should come from `apps/web/package.json`, not the root workspace package.

That means this PR should plan for:

- `next.config.ts` in `apps/web` importing `./package.json`
- `scripts/release.ts` updating `apps/web/package.json`
- `notes/RELEASE.md` being updated to describe `apps/web/package.json` as the version source

The root package should not become the release-version source once it stops being the deployable app.

### 6. Vercel project settings must be updated as part of Step 0

After moving the app:

- set the existing Vercel project's Root Directory to `apps/web`
- keep the existing project and deploy hook rather than creating a new production project
- move `vercel.json` into `apps/web` so production gating on `main` remains attached to the deployed app root

This is the biggest operational gotcha in Step 0.

## Execution Plan

### Phase A: Step 0 skeleton

1. Create root workspace shape:
   - add root `"workspaces": ["apps/**", "packages/**"]`
   - add `turbo` as a root dev dependency
   - add `turbo.json`
2. Create `apps/web/`
3. Move the current app package contents under `apps/web`
4. Keep the root package private and orchestration-only
5. Update root scripts so common commands still work from repo root

Expected root scripts after Step 0:

- `bun run check` from root
- `bun run build` from root, delegating to `apps/web`
- `bun run dev:next` from root, delegating to `apps/web`
- `bun run dev:convex` from root, delegating to `apps/web`
- `bun run release` from root, but targeting `apps/web/package.json`

### Phase B: Step 0 path and config repair

1. Move the existing app tsconfig into `apps/web/tsconfig.json`
2. Add a new minimal root `tsconfig.json` with no path aliases
3. Update any scripts that assume repo root contains app files
4. Update Next, Vercel, and Convex local-dev assumptions to the new app path
5. Confirm app build, Convex dev, and release tooling still work from the monorepo root

### Phase C: Step 1 Convex extraction

1. Create `packages/convex/`
2. Move Convex code out of `apps/web/convex`
3. Add `packages/convex/package.json`
4. Add `packages/convex/convex.json`
5. Keep Convex-specific TypeScript config local to that package
6. Update `apps/web` imports that currently reference `@/convex/...`
7. Decide what shared code must move into either:
   - a shared package, or
   - a neutral top-level shared location consumed via workspace dependency

Step 1 should prefer the smallest viable extraction:

- first make Convex its own package
- only extract shared code when the move requires it
- do not create multiple shared packages preemptively

## Likely Breakpoints

These are the repo-specific places most likely to need explicit edits:

- `next.config.ts`
  - currently imports `./package.json`
- `scripts/release.ts`
  - currently reads and edits root `package.json`
- `notes/RELEASE.md`
  - currently documents root `package.json` and root `vercel.json`
- `vercel.json`
  - must move with the deployed app root
- `assets/`
  - now stays at repo root and should not be treated as part of the app package move
- `convex/tsconfig.json`
  - currently maps `@/*` to `"../*"`; that should remain valid in Step 0 after moving the app tsconfig, but will need a deliberate review in Step 1 when Convex leaves `apps/web`
- root-level scripts that assume app files live at repository root
- any code importing `@/convex/...`
  - this will become the hardest part of Step 1 if left unplanned

## Verification Checklist

### After Step 0

- `bun install` works from repo root
- `bun run check` works from repo root
- `bun run build` works from repo root
- `bun run dev:next` works from repo root
- `bun run dev:convex` works from repo root
- Vercel preview build works with project Root Directory set to `apps/web`
- production deploy gating still works via the moved `apps/web/vercel.json`
- `bun run release --dry-run` still validates the correct version source

### After Step 1

- Convex codegen works from the new backend package
- web app imports the generated Convex client types successfully
- `bun run dev:convex` works from repo root against `packages/convex`
- `bun run check` still works from repo root
- web build and preview deploy still succeed

## Non-Goals

This PR should not:

- redesign ORCA architecture
- introduce Cloudflare Workers yet
- split the logo system yet
- create a large shared package taxonomy
- adopt TypeScript project references unless they become necessary during extraction
- change lint/format ownership away from the monorepo root

## Recommendation

Treat this as a repo-shape PR with one strong guiding principle:

> First create the monorepo shell without changing the app's semantics. Then extract Convex as the first real workspace boundary.

That sequencing keeps risk low, keeps the release/deploy system understandable, and avoids mixing structural migration with backend redesign.
