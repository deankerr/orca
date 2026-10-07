# Configuration

Variables and deployment defaults, grouped by package and scope.

## Legend

| Symbol | Meaning                                                             |
| ------ | ------------------------------------------------------------------- |
| 🔒     | Secret; keep out of Git, tool output, and browser bundles.          |
| ◇      | Environment-specific.                                               |
| 🌐     | Public.                                                             |
| ⚙      | Generated or supplied by a platform/tool.                           |
| ◆      | ORCA-defined variable.                                              |
| ⇄      | Must agree across locations or processes; the row identifies which. |

`NEXT_PUBLIC_*` values are public web build configuration. Local `.env*` files are
ignored by Git.

## Backend — `packages/backend`

### Convex runtime: `convex.config.ts`

Set these in the **Convex deployment environment**, validated by
[`convex.config.ts`](../../packages/backend/convex/convex.config.ts). Project defaults
initialize new deployments; update existing deployments explicitly. When changing these
variables, update both dev and preview defaults and this reference. The defaults below
are shared by dev and preview; “unset” means the code fallback applies.

#### Administrator access and public links

| Variable             | Flags  | Consumer / fallback / relationship                                               | Dev/preview default               |
| -------------------- | ------ | -------------------------------------------------------------------------------- | --------------------------------- |
| `ORCA_ADMIN_USER_ID` | ◆ ◇ ⇄  | One authorized WorkOS user; unset denies everyone. Production uses its own user. | `user_01M45DYDABT9537G38YC4Q1BK3` |
| `ORCA_WEB_ORIGIN`    | ◆ ◇ 🌐 | Web origin for Discord links.                                                    | `https://orca.orb.town/`          |
| `ORCA_LOGO_ORIGIN`   | ◆ ◇ 🌐 | Logo origin for Discord images.                                                  | `https://logos.orb.town`          |

#### Object storage and shared source data

| Variable                            | Flags    | Consumer / fallback / relationship                                   | Dev/preview default    |
| ----------------------------------- | -------- | -------------------------------------------------------------------- | ---------------------- |
| `ORCA_OBJECTS_BACKEND`              | ◆ ◇      | Storage for new objects. Existing objects retain their backend.      | Unset → `convex`       |
| `ORCA_OBJECTS_SOURCE_DEPLOYMENT`    | ◆ ◇      | Canonical read source; unset reads locally. Writes remain local.     | `dependable-husky-550` |
| `ORCA_OBJECTS_API_KEY`              | ◆ 🔒 ◇ ⇄ | Shared credential; source and consuming deployments must agree.      | Configured secret      |
| `ORCA_OBJECTS_R2_ACCOUNT_ID`        | ◆ ◇      | Cloudflare account owning the bucket.                                | Unset                  |
| `ORCA_OBJECTS_R2_BUCKET`            | ◆ ◇      | Bucket for R2 objects.                                               | Unset                  |
| `ORCA_OBJECTS_R2_ACCESS_KEY_ID`     | ◆ 🔒 ◇   | R2 access credential.                                                | Unset                  |
| `ORCA_OBJECTS_R2_SECRET_ACCESS_KEY` | ◆ 🔒 ◇   | R2 signing secret, required even for existing-object reads/removals. | Unset                  |

Dev/preview have no R2 access. They read canonical objects through the source
deployment’s object API and store local writes in Convex.

Keep the object source fixed while a timeline or pending processor work exists.

#### Collection, ingestion, and Discord

Switches below enable their guarded entry point only for the exact string `true`;
missing/`false` disables it.

| Variable                         | Flags | Consumer / fallback                                                                                            | Dev/preview default |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------- | ------------------- |
| `ORCA_SCAN_CRON_ENABLED`         | ◆ ◇   | Enables scheduled scan capture; manual runs bypass it.                                                         | `false`             |
| `ORCA_INGESTION_CRON_ENABLED`    | ◆ ◇   | Enables scheduled ingestion; manual runs and continuations bypass it.                                          | Unset → disabled    |
| `ORCA_ANALYTICS_CRON_ENABLED`    | ◆ ◇   | Enables scheduled upstream analytics collection.                                                               | Unset → disabled    |
| `ORCA_TOP_APPS_CRON_ENABLED`     | ◆ ◇   | Enables scheduled upstream top-apps collection.                                                                | Unset → disabled    |
| `ORCA_DISCORD_AUTO_SEND_ENABLED` | ◆ ◇   | Admits automatic alert preparation; explicit submissions bypass it. Queued delivery has its own pause control. | `false`             |

Discord URLs are registered destination records in the discordDelivery component.
Automatic ORCA routes default to **3,600,000 ms (one hour)** maximum age from the
observation time; configure each route explicitly. Queue pause is independent of
automatic admission. The obsolete webhook URL default was removed from dev/preview
on October 7, 2026; existing deployments running earlier code retain their values
until migrated. See docs/orca/discord.md for registration and development demo procedures.

The reusable sender defaults to **8 attempts per message**, a **20-second HTTP timeout**,
**1-second exponential retry backoff capped at 60 seconds**, and a **30-second recovery
poll** while a scheduled request remains active. Sleeps for future send times and
cooldowns are capped at **24 hours** per wakeup; the original deadline still applies.
Discord-provided cooldowns take
precedence when longer. Groups accept at most **500 messages**, **256 KiB per payload**,
and **4 MiB total payloads**. Configure expiry and retry attempts at submission;
retention is unlimited. These limits live in packages/discord-delivery/src/component.

Development `demoScan` accepts at most **1,000 events** from one scan, failing rather
than sending a partial scan. Its deliveries start now without expiry; each invocation
creates fresh groups.

Discord batching requires **3 distinct entities** with the same change at one observation,
including endpoint unlistings. The threshold is hardcoded in
`packages/backend/convex/alerts/shared/batch.ts`.

### Developer login storage: project defaults and deployment environment

Retrieve through the authenticated Convex CLI for browser login.

| Variable                  | Flags    | Consumer / relationship                                            | Dev/preview default |
| ------------------------- | -------- | ------------------------------------------------------------------ | ------------------- |
| `ORCA_DEV_ADMIN_EMAIL`    | ◆ ◇ ⇄    | Shared dev/preview browser login; absent in production.            | `admin@orca.test`   |
| `ORCA_DEV_ADMIN_PASSWORD` | ◆ 🔒 ◇ ⇄ | Must match WorkOS, dev/preview defaults, and existing deployments. | Configured secret   |

`ORCA_ADMIN_USER_ID` identifies the same account. See [development login](admin-access.md#development-login).

### Convex authentication: `auth.config.ts`

[`auth.config.ts`](../../packages/backend/convex/auth.config.ts) configures the trusted
WorkOS issuer and JWKS.

| Variable           | Flags    | Consumer / relationship                                                                                                                            | Dev/preview default                 |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `WORKOS_CLIENT_ID` | ◇ 🌐 ⚙ ⇄ | Must match the web app's AuthKit client ID and the selected managed WorkOS environment. Shared across dev/preview; production uses its own client. | `client_01M41R06GBGE6K7FC2NX1EXFC7` |

### Local CLI, dev server, and managed AuthKit: `convex.json`

Local inputs live in **`packages/backend/.env.local`** or the dev process environment.
Vercel supplies build inputs for deployed apps.

| Variable                          | Flags    | Consumer / relationship                                                                                                                                         |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOYMENT`               | ◇ ⚙      | Local Convex CLI deployment selection.                                                                                                                          |
| `CONVEX_DEPLOY_KEY`               | 🔒 ◇     | Convex deploy credential supplied by Vercel for automated builds, scoped separately for production and previews.                                                |
| `WORKOS_CLIENT_ID`                | ◇ 🌐 ⚙ ⇄ | Managed auth environment's client ID; must agree with the deployed auth config and web app.                                                                     |
| `WORKOS_API_KEY`                  | 🔒 ◇ ⚙   | WorkOS environment credential used by managed AuthKit configuration. The web app also needs a server credential for this same environment.                      |
| `WORKOS_ENVIRONMENT_ID`           | ◇ ⚙      | Managed WorkOS environment selection. Dev/preview default: `environment_01M41R065TB5P1NN7FXF4500A5`.                                                            |
| `PORTLESS_URL`                    | ◇ 🌐 ⚙ ⇄ | Backend dev obtains it with `portless get orca`. Must match the web dev server's external origin so the registered callback/CORS URLs match the browser origin. |
| `VERCEL_BRANCH_URL`               | ◇ 🌐 ⚙ ⇄ | Vercel preview branch hostname, without a scheme. Both Convex registration and Next.js callback selection use it for the same build.                            |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | ◇ 🌐 ⚙ ⇄ | Callback origin must agree with Convex registration. Next.js selects the final URL.                                                                             |

[`convex.json`](../../packages/backend/convex.json) registers `${PORTLESS_URL}/callback`
and its origin for dev, and `https://${VERCEL_BRANCH_URL}/callback` and its origin for
previews. Production callback, homepage, and CORS registration instead hardcode
**`https://orca.orb.town`**.

## Web — `apps/web`

Set local values in **`apps/web/.env.local`** and deployed values in **Vercel
Production / Preview settings**. Vercel runs Convex deployment before building
Next.js and supplies the selected backend URL to that build.

### Backend connection and public assets

| Variable                       | Flags    | Consumer / fallback / relationship                           |
| ------------------------------ | -------- | ------------------------------------------------------------ |
| `NEXT_PUBLIC_CONVEX_URL`       | ◇ 🌐 ⚙ ⇄ | Cloud URL of the backend selected by the CLI/build.          |
| `NEXT_PUBLIC_ORCA_LOGO_ORIGIN` | ◆ ◇ 🌐   | Browser avatar origin; default **`https://logos.orb.town`**. |

### AuthKit server and callback configuration

| Variable                          | Flags    | Consumer / fallback / relationship                                                                |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `WORKOS_CLIENT_ID`                | ◇ 🌐 ⚙ ⇄ | AuthKit application ID; must match the backend's trusted client and selected managed environment. |
| `WORKOS_API_KEY`                  | 🔒 ◇ ⚙   | AuthKit server credential for that WorkOS environment, read by the integration.                   |
| `WORKOS_COOKIE_PASSWORD`          | 🔒 ◇     | At least 32 characters. Instances sharing sessions need the same secret.                          |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | ◇ 🌐 ⚙ ⇄ | Callback origin must agree with Convex registration. Next.js selects the final URL.               |

Keep the callback override unset in Vercel so Next.js and Convex select matching
origins. The local fallback is **`https://orca.localhost/callback`**. See [administrator access](admin-access.md) for WorkOS policy and logout configuration.

### Analytics and build inputs

| Variable                            | Flags    | Consumer / fallback / relationship                                                                                                                           |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_POSTHOG_KEY`           | ◇ 🌐     | Browser ingestion key. Missing/blank disables analytics; also requires `NEXT_PUBLIC_VERCEL_ENV=production`.                                                  |
| `POSTHOG_API_KEY`                   | 🔒 ◇     | Build integration's personal API credential for source-map uploads. Upload integration is enabled only when this and `POSTHOG_PROJECT_ID` are defined.       |
| `POSTHOG_PROJECT_ID`                | ◇        | Destination project for source-map uploads; pair with the matching PostHog credential.                                                                       |
| `VERCEL_ENV`                        | ◇ ⚙ ⇄    | Server/build deployment tier. Selects callback defaults and the preview title prefix. Must describe the same tier as the browser's `NEXT_PUBLIC_VERCEL_ENV`. |
| `NEXT_PUBLIC_VERCEL_ENV`            | ◇ 🌐 ⚙ ⇄ | Browser deployment tier, supplied by Vercel alongside `VERCEL_ENV`. Analytics runs only for `production`.                                                    |
| `VERCEL_BRANCH_URL`                 | ◇ 🌐 ⚙ ⇄ | Preview callback hostname shared with Convex's build-time registration.                                                                                      |
| `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` | ◇ 🌐 ⚙   | Invalidates the persisted public query cache and tags analytics. Defaults to `development`.                                                                  |
| `NODE_ENV`                          | ⚙        | Runtime mode. Development enables the local title prefix, breakpoint indicator, and detailed error UI.                                                       |

[`next.config.ts`](../../apps/web/next.config.ts) hardcodes PostHog proxy destinations
**`us-assets.i.posthog.com`** and **`us.i.posthog.com`**;
[`instrumentation-client.ts`](../../apps/web/instrumentation-client.ts) uses
**`https://us.posthog.com`** as the UI host. EU or self-hosted PostHog needs endpoint
changes as well as different credentials.

### Local dev server

| Variable          | Flags    | Consumer / fallback / relationship                                                                                                                            |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORTLESS_URL`    | ◇ 🌐 ⚙ ⇄ | Portless supplies the checkout's external app origin to Next.js. Takes precedence over a stale callback override and must agree with the backend dev process. |
| `ORCA_DEV_ORIGIN` | ◆ ◇ 🌐   | Additional origin allowed by the Next.js dev server.                                                                                                          |

Both dev scripts use Portless name **`orca`**. Keep their origins aligned with
AuthKit callbacks and logout registrations.

## Logos — `apps/logos`

[`wrangler.jsonc`](../../apps/logos/wrangler.jsonc) names the Worker
**`entity-logo-service`** within the selected Cloudflare account. `ASSETS` is its
static-assets object binding.

## Root tooling

[`turbo.json`](../../turbo.json) passes `PORTLESS*` and `ORCA_DEV_ORIGIN` to dev tasks
and declares PostHog/Vercel build inputs.

## Configuration ownership

Production origin **`https://orca.orb.town`** is repeated in Convex AuthKit registration,
Next.js callback defaults, and the backend web-origin setting. Keep them aligned.
Logo origins are configured separately for web and Discord. WorkOS login policy and
logout allowlists are managed outside Git.
