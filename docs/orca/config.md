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

Set these in the **Convex deployment environment**, parsed by `convex.config.ts`.
Project defaults initialize new deployments. The defaults below are shared by dev
and preview; “unset” means the code fallback applies.

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

| Variable                         | Flags | Consumer / fallback                                                         | Dev/preview default |
| -------------------------------- | ----- | --------------------------------------------------------------------------- | ------------------- |
| `ORCA_SCAN_CRON_ENABLED`         | ◆ ◇   | Enables scheduled scan capture; manual runs bypass it.                      | `false`             |
| `ORCA_INGESTION_CRON_ENABLED`    | ◆ ◇   | Enables scheduled ingestion; manual runs and continuations bypass it.       | Unset → disabled    |
| `ORCA_ANALYTICS_CRON_ENABLED`    | ◆ ◇   | Enables scheduled upstream analytics collection.                            | Unset → disabled    |
| `ORCA_TOP_APPS_CRON_ENABLED`     | ◆ ◇   | Enables scheduled upstream top-apps collection.                             | Unset → disabled    |
| `ORCA_DISCORD_AUTO_SEND_ENABLED` | ◆ ◇   | Enables automatic alerts after fresh event commits; manual sends bypass it. | `false`             |

Discord alert maximum age is **3,600,000 ms (one hour)**, defined in
`packages/backend/convex/alerts/discord/delivery.ts`. Automatic deadlines use
`scan_at`; manual `sendIngestion` deadlines use invocation time.

Discord batching requires **3 distinct entities** with the same change at one observation,
including endpoint unlistings. The threshold is hardcoded in
`packages/backend/convex/alerts/shared/batch.ts`.

### Developer login storage: project defaults and deployment environment

Retrieve through the authenticated Convex CLI for browser login.

| Variable                  | Flags    | Consumer / relationship                                            | Dev/preview default |
| ------------------------- | -------- | ------------------------------------------------------------------ | ------------------- |
| `ORCA_DEV_ADMIN_EMAIL`    | ◆ ◇ ⇄    | Shared dev/preview browser login; absent in production.            | `admin@orca.test`   |
| `ORCA_DEV_ADMIN_PASSWORD` | ◆ 🔒 ◇ ⇄ | Must match WorkOS, dev/preview defaults, and existing deployments. | Configured secret   |

`ORCA_ADMIN_USER_ID` identifies the same account.

### Convex authentication: `auth.config.ts`

`auth.config.ts` configures the trusted WorkOS issuer and JWKS.

| Variable           | Flags    | Consumer / relationship                                                                                                                            | Dev/preview default                 |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `WORKOS_CLIENT_ID` | ◇ 🌐 ⚙ ⇄ | Must match the web app's AuthKit client ID and the selected managed WorkOS environment. Shared across dev/preview; production uses its own client. | `client_01M41R06GBGE6K7FC2NX1EXFC7` |

### Local CLI, dev server, and managed AuthKit: `convex.json`

Local inputs live in **`packages/backend/.env.local`** or the dev process environment.
Vercel supplies build inputs for deployed apps.

| Variable                          | Flags    | Consumer / relationship                                                                                                                                                                                                 |
| --------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOYMENT`               | ◇ ⚙      | Local Convex CLI deployment selection.                                                                                                                                                                                  |
| `CONVEX_DEPLOY_KEY`               | 🔒 ◇     | Convex deploy credential supplied by Vercel for automated builds, scoped separately for production and previews.                                                                                                        |
| `WORKOS_CLIENT_ID`                | ◇ 🌐 ⚙ ⇄ | Managed auth environment's client ID; must agree with the deployed auth config and web app.                                                                                                                             |
| `WORKOS_API_KEY`                  | 🔒 ◇ ⚙   | WorkOS environment credential used by managed AuthKit configuration. The web app also needs a server credential for this same environment.                                                                              |
| `WORKOS_ENVIRONMENT_ID`           | ◇ ⚙      | Managed WorkOS environment selection. Dev/preview default: `environment_01M41R065TB5P1NN7FXF4500A5`.                                                                                                                    |
| `ORCA_DEV_URL`                    | ◇ 🌐 ⚙ ⇄ | Browser-facing dev URL supplied by root startup to Next.js and Convex. Backend-only commands fall back to the root local URL lookup. Process input; derived per checkout rather than stored in Convex project defaults. |
| `VERCEL_BRANCH_URL`               | ◇ 🌐 ⚙ ⇄ | Vercel preview branch hostname, without a scheme. Both Convex registration and Next.js callback selection use it for the same build.                                                                                    |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | ◇ 🌐 ⚙ ⇄ | Callback origin must agree with Convex registration. Next.js selects the final URL.                                                                                                                                     |

`convex.json` registers `${ORCA_DEV_URL}/callback`
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

Next.js derives the callback from `ORCA_DEV_URL` during development,
`VERCEL_BRANCH_URL` for preview builds, and **`https://orca.orb.town`** for other
builds. `NEXT_PUBLIC_WORKOS_REDIRECT_URI` is a derived output; keep it unset in
Vercel.

### WorkOS sign-out URIs

The shared dev/preview environment has these entries in WorkOS Applications → Redirects → Sign-out URIs:

| URI                                                       | Scope                             |
| --------------------------------------------------------- | --------------------------------- |
| `https://orca.localhost/`                                 | Main local checkout               |
| `https://*.orca.localhost/`                               | Local worktrees                   |
| `https://orca-git-*-deank.vercel.app/`                    | Vercel branch previews            |
| `https://fserv.bleak-scala.ts.net/`                       | Default Tailscale HTTPS port      |
| `https://fserv.bleak-scala.ts.net:8443/` through `:8450/` | Eight explicit additional entries |

Update these when changing the hostname scheme, development host, or Vercel project/team.
The fserv entries cover Portless's nine preferred Tailscale HTTPS ports. Additional ports need
explicit entries: WorkOS permits wildcard logout ports only on localhost/loopback. Keep trailing
slashes to match the app's logout destination. Managed AuthKit registers callbacks and CORS;
the sign-out allowlist is managed separately.

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

`next.config.ts` hardcodes PostHog proxy destinations
**`us-assets.i.posthog.com`** and **`us.i.posthog.com`**;
`instrumentation-client.ts` uses
**`https://us.posthog.com`** as the UI host. EU or self-hosted PostHog needs endpoint
changes as well as different credentials.

### Local dev server

| Variable                 | Flags  | Consumer / relationship                                                                                             |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `PORTLESS_URL`           | ◇ 🌐 ⚙ | Portless's local URL; root startup uses it when no Tailscale URL is supplied.                                       |
| `PORTLESS_TAILSCALE`     | ◇      | Set to `1` in the host's shell or service environment to enable tailnet sharing. Leave unset for local development. |
| `PORTLESS_TAILSCALE_URL` | ◇ 🌐 ⚙ | Portless's tailnet URL, including the allocated HTTPS port; preferred by root startup.                              |

Root `portless.json` owns the app name. Root dev commands resolve the browser URL
once and pass `ORCA_DEV_URL` through Turbo. Next.js derives the callback and allowed
dev hostname from it; Convex registers that same callback and origin with WorkOS.
Use the root dev commands so the URL and server port come from the same launch.

Backend-only commands use the local URL from `dev:origin`. Web startup runs
`convex dev --once` against the selected backend before Next.js, synchronizing
backend code and registering the callback even when starting only the web app.
Portless owns worktree prefixes, port allocation, and forwarding cleanup.

## Logos — `apps/logos`

`wrangler.jsonc` names the Worker **`entity-logo-service`** within the selected Cloudflare account.
`ASSETS` is its static-assets object binding.

`OUTPUT_IMAGE_SIZE_PX` in `apps/logos/src/build.ts` sets the generated image canvas to **128×128**.
`run_worker_first` is unset, so static asset hits do not invoke the Worker.

## Root tooling

`turbo.json` passes the allocated port, host, CA certificate and `ORCA_DEV_URL`
to dev tasks and declares PostHog/Vercel build inputs.

## Configuration ownership

Production origin **`https://orca.orb.town`** is repeated in Convex AuthKit registration,
Next.js callback defaults, and the backend web-origin setting. Keep them aligned.
Logo origins are configured separately for web and Discord. WorkOS login policy and
logout allowlists are managed outside Git.
