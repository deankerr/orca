# Releases

Simple incrementing version tags: `v1`, `v2`, `v3`, etc.

## Architecture

- **Production deploys are gated.** Vercel auto-production-deploy on main push is disabled. Production only deploys when a GitHub release is created.
- **Preview deploys are automatic.** PR preview deployments on Vercel still work as normal.
- **GitHub Actions triggers the deploy.** When a release is created, a GitHub Action curls the Vercel Deploy Hook, triggering a production build.
- **Version tracking.** The version tag is baked into the build (`NEXT_PUBLIC_APP_VERSION`) and sent to PostHog as a super property (`app_version`) on every event.

## How It Works

1. `bun run release` finds the latest `v*` tag and increments it
2. `gh release create` creates the git tag + GitHub release with auto-generated PR changelog
3. GitHub Action (`deploy-production.yml`) triggers on `release: created`
4. Action curls the Vercel Deploy Hook, triggering a production build from `main`
5. Vercel builds from HEAD of main — the tag exists on this commit, so `git describe --tags --always` outputs `v2` exactly
6. `next.config.ts` captures this as `NEXT_PUBLIC_APP_VERSION` at build time
7. `instrumentation-client.ts` registers it as a PostHog super property (`app_version`)

Version fallback chain: git tag → `VERCEL_GIT_COMMIT_SHA` (short) → `"unknown"`.

## Commands

```bash
bun run release                    # auto-increment, auto-generate notes, deploy via GH Action
bun run release "short summary"    # with a title
bun run release --dry-run          # preview without creating or deploying
```

## Workflow: Landing a Graphite Stack

```
1. Work on feature across stacked PRs
2. Submit stack: gt ss
3. PRs are reviewed and merged to main sequentially by Graphite
   - Each merge triggers a Vercel build (skipped for production via Ignored Build Step)
   - Preview builds still work
   - No production deploy happens
4. Wait for the entire stack to land on main
5. Run: bun run release "table perf"
   - Tags HEAD of main as v2
   - Creates GitHub release with changelog from merged PRs
   - GitHub Action fires, curls deploy hook
   - Vercel builds main at the tagged commit → version is v2
```

**Important:** Only run `bun run release` after the full stack has landed. If Graphite is still merging PRs, HEAD of main may not be the final commit in the stack.

## Manual Redeploy

If a production deploy needs to be re-triggered (build failure, env var change, etc.), curl the deploy hook directly:

```bash
curl -X POST "$VERCEL_DEPLOY_HOOK"
```

The deploy hook URL is in Vercel Dashboard > orca > Settings > Git > Deploy Hooks. This rebuilds from current HEAD of main without creating a new release or version bump.

Without build cache:

```bash
curl -X POST "$VERCEL_DEPLOY_HOOK?buildCache=false"
```

## Hotfix

```
1. Push fix directly to main (or fast-track a single PR)
2. Run: bun run release "fix: whatever broke"
   - Creates v3, GitHub Action triggers deploy
```

If the fix is urgent and you don't want to bump the version, just curl the deploy hook manually. The build version will be `v2-1-gabcdef` (1 commit after v2).

## Corner Cases

**Race condition: new commit lands between tag and deploy.**
The deploy hook builds HEAD of main, not a specific commit. If a commit is pushed to main between the tag creation and the deploy hook firing, the build will include that extra commit. For a solo dev project this is practically impossible — the release, GitHub Action, and hook fire within seconds. The version string reveals the state: `v2` = exactly the tagged commit, `v2-1-gabcdef` = 1 commit after the tag.

**Multiple releases without code changes.**
Running `bun run release` twice without new commits creates a new tag on the same commit and a redundant deploy. Harmless but wasteful. Use `--dry-run` to preview.

**Preview deploys show commit SHA, not version tag.**
Preview deploys build from PR branches which won't have version tags. `git describe` outputs something like `v2-5-gabcdef` or just a commit SHA. This is expected.

**First release (no existing tags).**
`git describe --tags --always` falls back to the short commit SHA. After `bun run release` creates `v1`, all subsequent builds resolve correctly.

## PostHog Version Tracking

Every event is tagged with `app_version`. Filter any insight by this property to:

- Compare web vitals before/after a perf change
- Track error rates per version
- Correlate feature adoption with specific releases

## Setup

### Vercel Dashboard

**Ignored Build Step** (orca > Settings > Git > Ignored Build Step):

```
[ "$VERCEL_ENV" != "production" ]
```

Skips production builds from git pushes (exit 1 = don't build). Preview builds pass through (exit 0 = build). Deploy Hook builds are unaffected by this setting.

**Deploy Hook** (orca > Settings > Git > Deploy Hooks):

Create a hook named `production` targeting the `main` branch. Copy the URL and store it as a GitHub secret (see below).

### GitHub Secrets (repo > Settings > Secrets and variables > Actions)

| Secret | Value |
|--------|-------|
| `VERCEL_DEPLOY_HOOK` | Deploy Hook URL from Vercel Dashboard |

### Files

| File | Purpose |
|------|---------|
| `scripts/release.ts` | Release script: tag + GitHub release |
| `.github/workflows/deploy-production.yml` | GitHub Action: triggers deploy hook on release |
| `next.config.ts` | Captures version from `git describe` at build time |
| `instrumentation-client.ts` | Sends version to PostHog as super property |
