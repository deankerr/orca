# ORCA setup

For our machines and agents. Assumes GitHub access, Bun, Node.js, and Portless.
Project: **`deankerr:orca-b8162`**.

## Project setup

1. Provision AuthKit through the Convex dashboard: one shared environment for
   dev/preview and a separate production environment.
2. Set the dev/preview defaults in [configuration](config.md). Defaults initialize
   new deployments; apply changes to existing deployments explicitly.
3. Enable password login in shared AuthKit. Create a verified `admin@orca.test` user
   with external ID `orca-development-admin`. An agent can use the WorkOS MCP with
   Convex-provided credentials.
4. Store that user's email, password, and ID in the three admin defaults listed in
   config.md. Password rotation updates WorkOS and every stored copy.
5. Enable production GitHub OAuth, set the real admin's ID, and disable signups.
   Register logout destinations from [admin access](admin-access.md#environments).
6. In each Vercel scope, set the Convex deploy credential, matching WorkOS client/API
   credentials, and a generated cookie secret. Verify auth in a preview before production.

## Machine and checkout setup

Authorize the CLI with `bun run --cwd packages/backend convex login`
(`--no-open` for a remote terminal).

Use [worktree setup](../../.agents/skills/orca-worktree-setup/SKILL.md) for an isolated
backend and web app. A fresh main checkout uses its personal dev deployment.
Editing and local checks require only `bun install --frozen-lockfile`.

For a remote development host, connect Tailscale, enable tailnet HTTPS, and grant
the development user permission to manage Tailscale Serve. Set
`export PORTLESS_TAILSCALE=1` in the host's shell startup configuration. If the agent
server runs as a systemd service, also set `Environment=PORTLESS_TAILSCALE=1` in its
service override and restart it to inherit the setting. Then `bun run dev` and
`bun run dev:web` print a tailnet URL that the browser can open. On a local machine,
leave the flag unset for the usual Portless `.localhost` URL.
