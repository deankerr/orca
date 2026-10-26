# ORCA setup

Requires repository access, Bun, Node.js 24.2+, and a global Portless installation. Convex hosts the backend;
Vercel deploys the web app. `config.md` records environment values and defaults.

## Services

Provision AuthKit through Convex with shared dev/preview and separate production environments. Apply
the maintained project defaults before creating deployments. Configure WorkOS login policy and sign-out
allowlists for those environments.

For development password login, create a verified administrator with external ID `orca-development-admin`.
Store the matching email, password, and user ID in the dev/preview defaults. Password rotation must update
WorkOS and every stored copy. Convex-provided WorkOS credentials can be used for provisioning.

For each Vercel scope, configure its Convex deploy credential, matching WorkOS client/API credentials,
and cookie secret. The build deploys the backend before building the web app and supplies its URL.
Preview deployment also schedules Catalog initialization from existing captures.

An independently collecting deployment must read its own objects: clear `ORCA_OBJECTS_SOURCE_DEPLOYMENT`,
choose storage, and enable the required collection/ingestion schedules. Shared dev/preview defaults instead
read canonical remote captures. Source selection must be established before starting a timeline.

## Local checkout

Install dependencies and authorize the Convex CLI:

```sh
bun install --frozen-lockfile
bun run --cwd packages/backend convex login
```

Use `--no-open` for remote CLI login. Start from the root so Next.js and Convex receive the same browser origin:

```sh
bun run dev          # Web and backend
bun run dev:web      # Web
bun run dev:backend  # Backend
```

## Remote development host

Connect Tailscale, enable tailnet HTTPS, and permit the development user to manage Tailscale Serve.
Set `PORTLESS_TAILSCALE=1` in shell startup. An agent server running under systemd also needs
`Environment=PORTLESS_TAILSCALE=1` in its service override and a restart. Web startup prints the browser URL.
