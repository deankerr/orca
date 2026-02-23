# Releases

Simple incrementing version: `v35`, `v36`, `v37`, etc. Source of truth is `package.json` version field (`35.0.0` = `v35`).

## Architecture

- **Version lives in package.json.** Always available at build time, no git tag tricks needed.
- **Production deploys are gated.** Vercel auto-deploy on main push is disabled (`vercel.json`). Production only deploys when a GitHub release is created.
- **Preview deploys are automatic.** PR branches still get Vercel preview deployments.
- **CI checks on PRs.** GitHub Actions runs `bun check` (typecheck + lint) on every pull request.
- **GitHub Actions triggers the deploy.** Release created → Action curls the Vercel Deploy Hook.

## How It Works

1. `bun run release` reads the current major version from `package.json`
2. Bumps it (e.g. `35.0.0` → `36.0.0`), commits, pushes to main
3. `gh release create` creates the git tag + GitHub release with auto-generated changelog
4. GitHub Action (`deploy-production.yml`) triggers on `release: created`
5. Action curls the Vercel Deploy Hook, triggering a production build from `main`
6. `next.config.ts` reads `package.json` version → `NEXT_PUBLIC_APP_VERSION` = `v36`
7. `instrumentation-client.ts` registers it as a PostHog super property (`app_version`)

## Commands

```bash
bun run release                    # auto-increment, commit, push, deploy
bun run release "short summary"    # with a title
bun run release --dry-run          # preview without creating or deploying
```

## Workflow: Landing a Graphite Stack

```
1. Work on feature across stacked PRs
2. Submit stack: gt ss
3. PRs are reviewed and merged to main sequentially
   - CI runs bun check on each PR
   - Preview builds work
   - No production deploy happens
4. Wait for the entire stack to land on main
5. Run: bun run release "table perf"
   - Bumps package.json to v36, commits, pushes
   - Creates GitHub release with changelog
   - GitHub Action fires, curls deploy hook
   - Vercel builds main → version is v36
```

**Important:** Only run `bun run release` after the full stack has landed.

## Manual Redeploy

```bash
curl -X POST "$VERCEL_DEPLOY_HOOK"                       # with build cache
curl -X POST "$VERCEL_DEPLOY_HOOK?buildCache=false"       # without build cache
```

The deploy hook URL is in Vercel Dashboard > orca > Settings > Git > Deploy Hooks.

## Hotfix

```
1. Push fix directly to main (or fast-track a single PR)
2. Run: bun run release "fix: whatever broke"
```

## PostHog Version Tracking

Every event is tagged with `app_version`. Filter any insight by this property to compare metrics across releases.

## Setup

### Vercel Dashboard

`vercel.json` disables auto-production-deploys on main. Deploy Hook (`production`, targeting `main` branch) triggers builds.

### GitHub Secrets

| Secret | Value |
|--------|-------|
| `VERCEL_DEPLOY_HOOK` | Deploy Hook URL from Vercel Dashboard |

### Files

| File | Purpose |
|------|---------|
| `package.json` | Source of truth for version number |
| `scripts/release.ts` | Release script: bump, commit, tag, release |
| `.github/workflows/ci.yml` | PR checks: typecheck + lint |
| `.github/workflows/deploy-production.yml` | Triggers deploy hook on release |
| `next.config.ts` | Reads version from package.json at build time |
| `instrumentation-client.ts` | Sends version to PostHog as super property |
| `vercel.json` | Disables auto-production-deploy on main |
