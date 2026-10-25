# Configuration

Local inputs live in `packages/backend/.env.local` and `apps/web/.env.local`; deployed web inputs live
in Vercel's Production/Preview settings. Convex runtime variables live on each deployment. Project
defaults initialize new deployments; existing deployments need separate updates.

`NEXT_PUBLIC_*` values are public. Entries marked **secret** must stay out of Git, output, and browser
bundles. Dev/preview defaults below are maintained project settings; unset means the code fallback applies.

## Tests and tooling

Bun remains the package manager and report bundler. `.node-version` selects Node 24 for local tooling
and CI; the minimum is 24.2 for `import.meta.main`. `bun run test` runs Vitest on Node. Use
`bun run test:watch` for watch mode and `--project backend` (or another workspace name) to select a suite.

`vitest.config.ts` owns eight projects. Backend and Discord sender use `edge-runtime`; the other six use
Node. Test files stay isolated, and spies restore automatically. `bun run test:coverage` uses V8 coverage;
it does not instrument the Bun subprocess that builds HTML reports. That CLI is exercised with real
bundling and output assertions.

Convex tests use installed component helpers. Aggregate 0.3.4 omits nested registration, so the backend's
batch-worker test dependency must match Aggregate's pinned 0.3.3 dependency. Workpool registers its own
nested worker through its helper.

The pure ingestion decisions in `ingestion/decide.ts` also have property tests (`decide.property.test.ts`,
fast-check 4.10.2, a backend dev dependency) that run on the default 100 cases per property. They cover queue
selection and register convergence for any batch limit.

Scheduler scenarios advance to the next timer and await started Convex invocations before advancing
again. The shared drain stops after 1000 timer turns. It assumes handlers do not await fake-timer sleeps;
tests of such waits must drive the clock explicitly. This avoids advancing watchdogs and expiry while
module loading or other asynchronous work is still running. CI also runs the three scheduler suites
serially with two repeats per test.

## Backend runtime

`convex.config.ts` parses these deployment variables. Web and logo origins are required; the others
are optional. Object writes use the selected backend, while existing locators retain their storage type.

| Variable                            | Meaning                                                              | Dev/preview default               |
| ----------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| `ORCA_ADMIN_USER_ID`                | Authorized WorkOS subject; unset denies everyone.                    | `user_01M45DYDABT9537G38YC4Q1BK3` |
| `ORCA_WEB_ORIGIN`                   | Discord link origin.                                                 | `https://orca.orb.town/`          |
| `ORCA_LOGO_ORIGIN`                  | Discord image origin.                                                | `https://logos.orb.town`          |
| `ORCA_INGESTION_PARALLELISM`        | Concurrent ingestion actions, 1–100; read per enqueue.               | Unset → 16                        |
| `ORCA_OBJECTS_BACKEND`              | Storage for new objects: `convex` or `r2`.                           | Unset → `convex`                  |
| `ORCA_OBJECTS_SOURCE_DEPLOYMENT`    | Remote read source; unset/empty reads locally.                       | `dependable-husky-550`            |
| `ORCA_OBJECTS_API_KEY`              | **Secret** shared by source and readers.                             | Configured secret                 |
| `ORCA_OBJECTS_R2_ACCOUNT_ID`        | Cloudflare account owning the bucket.                                | Unset                             |
| `ORCA_OBJECTS_R2_BUCKET`            | R2 bucket.                                                           | Unset                             |
| `ORCA_OBJECTS_R2_ACCESS_KEY_ID`     | **Secret** R2 credential.                                            | Unset                             |
| `ORCA_OBJECTS_R2_SECRET_ACCESS_KEY` | **Secret** signing key, including for existing-object reads/removal. | Unset                             |

Dev/preview read canonical objects through the source deployment's object API and keep local writes in
Convex, without R2 access.

- Remote reads do not fall back to local objects.
- Keep source selection fixed while a timeline exists.
- A deployment collecting its own source must leave the override unset.

### Scheduled entry points

Each switch accepts `true` or `false`; only `true` enables the entry point named below.
Collection switches guard cron invocation, leaving manual collection available.

| Variable                         | Guarded entry point                             | Dev/preview default |
| -------------------------------- | ----------------------------------------------- | ------------------- |
| `ORCA_SCAN_CRON_ENABLED`         | Scan collection                                 | `false`             |
| `ORCA_INGESTION_CRON_ENABLED`    | Ingestion sync kickoff                          | Unset → disabled    |
| `ORCA_ANALYTICS_CRON_ENABLED`    | Analytics collection                            | Unset → disabled    |
| `ORCA_TOP_APPS_CRON_ENABLED`     | Top-apps collection                             | Unset → disabled    |
| `ORCA_DISCORD_AUTO_SEND_ENABLED` | Automatic Discord delivery for alerting records | `false`             |

`crons.ts` owns the schedules; wall-clock schedules use UTC.

| Job                                     | Schedule                                               |
| --------------------------------------- | ------------------------------------------------------ |
| Analytics / top apps                    | Daily at 00:05 / 00:15                                 |
| Scan collection                         | Hourly at minute 40                                    |
| Ingestion sync                          | Hourly at minute 50                                    |
| Independent public API V2 cache refresh | Hourly at minute 42, two minutes after scan collection |

### Maintained limits and defaults

Backend paths below are relative to `packages/backend/convex`.

| Setting                         | Value                                                                            | Owner                              |
| ------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| Ingestion register batch        | 24 new pairs per register step                                                   | `ingestion/register.ts`            |
| Ingestion queue batch           | 24 pairs accepted per queue step                                                 | `ingestion/queue.ts`               |
| Ingestion queue capacity        | 4 × concurrency queued or withdrawing; soft, from stale aggregate counts         | `ingestion/queue.ts`               |
| Ingestion histogram buckets     | At most 240 per request                                                          | `ingestion/admin.ts`               |
| Ingestion retry-all batch       | 256 failed records reopened per call                                             | `ingestion/queue.ts`               |
| Ingestion lost-completion sweep | 512 queued or withdrawing records read per kind and state                        | `ingestion/reconcile.ts`           |
| Ingestion lost-completion grace | 5 minutes after the sweep before a finished, unsettled record fails              | `ingestion/reconcile.ts`           |
| Preview ingestion lookback      | 24 hours before initialization; only when no target exists                       | `init.ts`                          |
| Grid unlisting window           | 30 days before the ingestion clock                                               | `products/grid/endpoints.ts`       |
| Discord alert age               | 3,600,000 ms; automatic deadline from scan time, manual deadline from invocation | `products/discord/delivery.ts`     |
| Discord batching                | 3 distinct entities with equivalent changes at one scan and entity kind          | `products/shared/alerts/batch.ts`  |
| Discord message order           | Per scan: additions, updates, removals; parents first, removals endpoints first  | `products/discord/render.ts`       |
| Discord frequent pricing        | Suppress after 2 prior quotes within 24 hours                                    | `products/discord/frequency.ts`    |
| Ordinary pricing eligibility    | Suppress discount adjustments ≤2 percentage points; require a meter change ≥2%   | `products/shared/alerts/filter.ts` |
| Feed page request               | Default 20, range 1–100 source rows before selection                             | `products/feed/http.ts`            |
| V5 alpha snapshot memo          | 60 seconds per server instance; failed reads are not memoized                    | `apps/web/app/api/v5-alpha`        |
| V5 alpha response cache         | `max-age=60`, `s-maxage=300`, `stale-while-revalidate=3600`                      | `packages/api/http.ts`             |
| Public API V2 shared cache      | `s-maxage=900` (15 minutes); `stale-while-revalidate=3600`                       | `public_api/v2/http.ts`            |

## WorkOS and deployment tooling

`WORKOS_CLIENT_ID` must agree across deployed `auth.config.ts`, the backend CLI, and the web app.
Use matching credentials from the selected WorkOS environment. Production has its own environment,
credentials, and administrator; development login credentials are absent there.

| Variable                  | Location and meaning                                                                  | Dev/preview default                      |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `WORKOS_CLIENT_ID`        | Deployment auth, backend CLI, and web AuthKit client                                  | `client_01M41R06GBGE6K7FC2NX1EXFC7`      |
| `WORKOS_API_KEY`          | **Secret** backend CLI and web server credential                                      | Managed environment credential           |
| `WORKOS_ENVIRONMENT_ID`   | Backend CLI managed AuthKit selection                                                 | `environment_01M41R065TB5P1NN7FXF4500A5` |
| `ORCA_DEV_ADMIN_EMAIL`    | Deployment/default storage for browser login                                          | `admin@orca.test`                        |
| `ORCA_DEV_ADMIN_PASSWORD` | **Secret** login storage; must match WorkOS and existing deployments                  | Configured secret                        |
| `CONVEX_DEPLOYMENT`       | Backend CLI deployment selection                                                      | Per checkout                             |
| `CONVEX_DEPLOY_KEY`       | **Secret** Vercel deploy credential, scoped separately for production/preview         | Per scope                                |
| `WORKOS_COOKIE_PASSWORD`  | **Secret** web session key, at least 32 characters; shared sessions need the same key | Per scope                                |

`ORCA_ADMIN_USER_ID` identifies the development login account. Retrieve login secrets through the
authenticated Convex CLI. WorkOS owns login policy and sign-out allowlists outside Git.

### Browser origins

`convex.json` registers callbacks/CORS; `next.config.ts` derives the matching callback URL.

| Environment | Browser origin                                                                |
| ----------- | ----------------------------------------------------------------------------- |
| Development | `ORCA_DEV_URL` from root startup                                              |
| Preview     | `https://${VERCEL_BRANCH_URL}`; Vercel supplies the hostname without a scheme |
| Production  | `https://orca.orb.town`                                                       |

- Callbacks append `/callback`; `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is derived and stays unset in Vercel.
- Keep production origins aligned across Convex registration, Next.js, and `ORCA_WEB_ORIGIN`.
- `ORCA_DEV_URL` is a process input, not a project default.
- Root startup prefers `PORTLESS_TAILSCALE_URL`, then `PORTLESS_URL`, then `dev:origin`.
- Backend-only startup falls back to `dev:origin`.

`portless.json` owns the app name. Portless allocates ports and forwarding; `turbo.json` passes the port,
host, CA certificate, and browser origin to dev tasks. `PORTLESS_TAILSCALE=1` enables tailnet sharing.
Web startup runs `convex dev --once` before Next.js, pushing code and registering the callback.

The maintained shared dev/preview WorkOS sign-out allowlist is:

| URI                                                       | Scope                           |
| --------------------------------------------------------- | ------------------------------- |
| `https://orca.localhost/`                                 | Main checkout                   |
| `https://*.orca.localhost/`                               | Worktrees                       |
| `https://orca-git-*-deank.vercel.app/`                    | Branch previews                 |
| `https://fserv.bleak-scala.ts.net/`                       | Default Tailscale HTTPS port    |
| `https://fserv.bleak-scala.ts.net:8443/` through `:8450/` | Eight additional explicit ports |

- Keep trailing slashes; update entries when hostnames or the Vercel project/team change.
- Tailnet entries cover Portless's nine preferred ports; additional ports need explicit entries.
- WorkOS wildcard logout ports are limited to localhost/loopback.
- Sign-out registration is separate from callbacks/CORS.

## Web assets and analytics

Vercel deploys Convex before building Next.js and supplies `NEXT_PUBLIC_CONVEX_URL` for that backend.

| Variable                            | Behavior                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL`            | Required backend cloud URL.                                                                   |
| `NEXT_PUBLIC_ORCA_LOGO_ORIGIN`      | Browser avatar origin; defaults to `https://logos.orb.town`.                                  |
| `NEXT_PUBLIC_POSTHOG_KEY`           | Public ingestion key shared by production and preview; blank/missing disables analytics.      |
| `NEXT_PUBLIC_POSTHOG_DEV`           | `true` enables analytics in local development; capture is otherwise disabled there.           |
| `NEXT_PUBLIC_VERCEL_ENV`            | Browser tier; analytics runs in production and preview. Tags events as `app_environment`.     |
| `VERCEL_ENV`                        | Server/build tier; selects preview callback/title behavior. Must agree with the browser tier. |
| `VERCEL_BRANCH_URL`                 | Preview branch hostname used by both backend and web builds.                                  |
| `POSTHOG_API_KEY`                   | **Secret** source-map upload credential; requires `POSTHOG_PROJECT_ID`.                       |
| `POSTHOG_PROJECT_ID`                | Source-map upload destination; requires `POSTHOG_API_KEY`.                                    |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | Query-cache invalidation and analytics version; defaults to `development`.                    |
| `NODE_ENV`                          | Development enables local title prefix, breakpoint display, and detailed errors.              |

The public query cache persists for 24 hours in browser local storage; its build key discards older
builds' entries before hydration. Browser and Discord logo origins are configured separately.

PostHog proxy destinations are `us-assets.i.posthog.com` and `us.i.posthog.com`; the UI host is
`https://us.posthog.com`. EU or self-hosted installations require endpoint changes as well as credentials.
`turbo.json` declares the PostHog/Vercel build inputs.

### Analytics events

- Every event carries `app_environment` (default `development`) and `client_id`; dashboards filter to production.
- Signed-in users are identified by WorkOS user ID, with name and email; sign-out and account switches reset identity.
- Query-analytics events carry their schema revision, starting at `event_version=1`.
- `query completed` covers successful fetches for grid endpoints, grid stats, and model/provider overviews.
- Select `client_cache_hit=false` and `consumer_active=true` for server-response waits with an active consumer.
- Failed fetches have no completion event; completions after all consumers leave are marked inactive.
- `duration_ms` spans TanStack fetch start to success; TanStack cache reads have zero duration.
- `connection_wait_ms` is the overlapping connection wait; `connected_ms` includes backend work and transfer.
- These are client observations, not server timings; server-side cache status is unknown.
- `result_count` describes returned rows; `data_scan_at`, where available, identifies the source observation.
- `convex connected` measures connection intervals from the first measured query, whatever view comes first.
- `query consumed` links a `query_run_id` to `view_load_id`; grids start at mount, overviews at open action.
- `grid ready` is a content-commit signal; never sum parallel query durations.
- Monotonic timestamps are comparable only within one client lifetime.
- `query updated` records later subscription arrivals without duration; each actual fetch gets a fresh run ID.

## Logo service

`apps/logos/wrangler.jsonc` names Worker `entity-logo-service` and static binding `ASSETS`. Static asset
hits bypass the Worker because `run_worker_first` is unset. `OUTPUT_IMAGE_SIZE_PX` in
`apps/logos/src/build.ts` sets generated canvases to 128×128.
