# ORCA setup

Requires GitHub access, Bun, Node.js 24+, and a global Portless installation.
The backend runs on Convex; the web app deploys through Vercel.

## Project setup

Provision AuthKit through the Convex dashboard with a shared dev/preview environment and a
separate production environment. Set project defaults from `config.md` before creating deployments.

Enable password login in shared AuthKit. Create a verified development administrator with
external ID `orca-development-admin`, using the email recorded in `config.md`. Store its email,
password, and user ID in the admin defaults. Password rotation must update WorkOS and every
stored copy. WorkOS MCP can use the Convex-provided credentials for provisioning.

Enable production GitHub OAuth, set the production administrator's ID, and disable signups.
Register the WorkOS sign-out URIs recorded in `config.md`.

In each Vercel scope, set the Convex deploy credential, matching WorkOS client/API credentials,
and a generated cookie secret. Verify authentication in a preview before production.

## Machine and checkout setup

Install dependencies from the repository root:

```sh
bun install --frozen-lockfile
```

Authorize the CLI with `bun run --cwd packages/backend convex login`
(`--no-open` for a remote terminal). Use `orca-worktree-setup` when a fresh worktree needs its
own backend or running app.

```sh
bun run dev          # Web and backend
bun run dev:web      # Web, with a backend push before startup
bun run dev:backend  # Backend
bun run fix          # Repository validation and formatting; mutates files
```

## Remote development host

Connect Tailscale, enable tailnet HTTPS, and grant the development user permission to manage
Tailscale Serve. Set `export PORTLESS_TAILSCALE=1` in the host's shell startup configuration.
For an agent server running as a systemd service, also set `Environment=PORTLESS_TAILSCALE=1`
in its service override and restart it to inherit the setting.

Web startup prints the tailnet URL that the browser can open.
