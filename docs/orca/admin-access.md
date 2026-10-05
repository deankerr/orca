# Administrator access

ORCA's public products remain anonymous. Signed-in users see an account menu in the
header; `/admin` requires authentication and explicit authorization. Each Convex deployment
explicitly authorizes one WorkOS application user via `ORCA_ADMIN_USER_ID`. An absent
or empty value denies everyone. Convex/WorkOS dashboard membership is unrelated.

After signing in at `/admin`, an unapproved user sees their application user ID.
Set that ID on the corresponding Convex deployment. Production and preview WorkOS
environments have separate users, so authorize them independently. Future private
Convex entry points must call `requireAdmin`; the Next.js layout alone cannot secure
direct calls to the backend.

`/admin` calls `admin.demo` through the authenticated browser Convex client. The
query calls `requireAdmin` and returns only a success message and the caller's ID;
it reads no application data and performs no writes. This is the initial production
smoke test before introducing sensitive admin features.

Admin queries use a separate, in-memory Convex/React Query client. They must not use
the public client's localStorage persistence. Logging out or leaving admin clears
the admin React Query cache.

## Environments

Convex manages the WorkOS team. `packages/backend/convex.json` configures allowed
callback URLs and origins when the CLI pushes. All dev deployments, including the
main checkout's personal dev deployment, and Vercel previews share the project's
**Previews** WorkOS environment, while retaining separate Convex databases. Production
has its own WorkOS environment and users. Existing application data does not require a
separate auth environment: ORCA has no user-owned application data to migrate.

The backend `dev` script obtains `PORTLESS_URL` from `portless get orca` and registers
that origin's callback. Portless supplies the same variable to Next.js, taking priority
over a stale redirect URL in `.env.local`. The main checkout uses `https://orca.localhost`;
linked worktrees use their own prefixed hostname. The shared Portless proxy must be
available when resolving that URL. For direct `convex` pushes, supply `PORTLESS_URL`
explicitly; use the backend `dev` script for ordinary development.
The AuthKit callback explicitly uses the configured redirect URI as its `baseURL`.
Behind Portless, Next.js's request URL can contain the internal server's hostname
and port; using that URL for the post-login redirect sends the browser to an HTTPS
address served by an HTTP-only server. If a login attempt fails, start again at
`/admin` rather than reloading `/callback`: its code and PKCE cookie belong to one
sign-in attempt and may already have been consumed.
For direct Next.js development on port 3000, register that origin by running the
Convex CLI with `PORTLESS_URL=http://localhost:3000` and set the web app's
`NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://localhost:3000/callback`.

New dev and preview deployments inherit `WORKOS_CLIENT_ID`, `WORKOS_API_KEY`, and
`WORKOS_ENVIRONMENT_ID` from their respective Convex project defaults, pointing to
Previews. Defaults apply at creation; changing them does not migrate existing deployments.
Existing dev deployments must be switched explicitly; production never uses these credentials.

For local setup, run `bun run --cwd packages/backend dev --once` after selecting the
worktree's dev deployment. With an interactive terminal, Convex writes its WorkOS
credentials into `packages/backend/.env.local`. Copy only `WORKOS_CLIENT_ID` and
`WORKOS_API_KEY` into `apps/web/.env.local`. In noninteractive setup, retrieve those
two deployment variables explicitly; capture them without logging secret values.
Generate a separate random `WORKOS_COOKIE_PASSWORD` of at least 32 characters in
the web environment. The backend workspace is not a Next.js app, so the CLI's
framework detection does not generate that cookie secret for us.

Vercel Production and Preview each need their matching `WORKOS_CLIENT_ID`,
`WORKOS_API_KEY`, and a random `WORKOS_COOKIE_PASSWORD`. Preview uses the shared
project-level WorkOS environment; production uses its own production environment.
The Next.js configuration supplies the callback URL from `VERCEL_BRANCH_URL` for
previews and `https://orca.orb.town/callback` for production. Leave
`NEXT_PUBLIC_WORKOS_REDIRECT_URI` unset in Vercel so it matches the callback Convex
registers. Portless supplies the local override.

The existing Vercel build command invokes `convex deploy` before building Next.js,
so the CLI receives the matching credentials and registers that build's callback.
`/sign-in` redirects an alternate hostname to that configured origin before creating
the PKCE cookie. Opening `/admin` on a unique Vercel deployment URL therefore continues
login on the branch URL, which serves the latest successful deployment of that branch.
The session cookie belongs to that branch, so another branch requires its own login
session even though it uses the same WorkOS account.

Dev and preview builds do not overwrite the shared WorkOS homepage. Logout always
supplies the originating app's configured URL explicitly. The shared environment's
logout allowlist covers `https://orca.localhost/`, `https://orca-git-*-deank.vercel.app/`, and
`https://*.orca.localhost/`. Revisit that list if the Vercel project/team or local
hostname scheme changes.

See [Convex's managed AuthKit configuration](https://docs.convex.dev/auth/authkit/auto-provision)
for the distinction between deployment-level and shared project-level environments.

## WorkOS policy and test identities

Run `bun run auth:setup` from the main checkout to create or reconcile the shared
development admin. Its intended attributes and nonproduction environment are defined
in `packages/scripts/auth/config.ts`. Setup reuses the stable external ID, verifies
the saved password, and sets `ORCA_ADMIN_USER_ID` on the selected dev deployment and
the project's dev/preview defaults. It refuses production and credential overrides.
It does not run as part of builds, start-up, or worktree creation.

The generated password lives in the main checkout's ignored `.env.auth.local` with
owner-only permissions. Rerunning setup preserves it. If that file is lost while the
account still exists, setup stops rather than resetting a credential other agents
may be using. Recover the file or deliberately rotate the password through WorkOS
and update the local file. No password or authenticated browser state belongs in Git.

Agents should stay signed out for ordinary public-app work. When admin access is
needed, find the main checkout with `git worktree list --porcelain`, read its
`.env.auth.local` without printing the password, and use the normal `/admin` login.
Sign out through the header menu to return to anonymous mode. Each app hostname has
its own session. There is no automatic-login endpoint or frontend test harness.

Convex 1.45's automatic configuration adds redirect URIs and CORS origins, and sets
the app homepage URL. It does not configure login methods, signup restrictions,
MFA, or sign-out URIs. Configure those in the matching WorkOS environment. Settings
and users are environment-scoped; production settings are not a template for newly
provisioned development environments.

An invitation is not the admin authorization boundary: the explicit Convex user-ID
allowlist is. Signing up alone never grants access. Keep production's real admin
identity separate from synthetic sandbox identities. Dev and preview tests can use
API-created, verified password users on reserved example domains, with generated
credentials held outside source control. No real mailbox or invitation is needed.
Authenticate through the WorkOS API for automated tests and create separate sessions
per worker. See [WorkOS testing](https://workos.com/docs/authkit/testing) and
[example email domains](https://workos.com/docs/email#testing-with-example-domains).

All dev deployments and preview branches share one WorkOS environment, so the managed
account's ID can be reused across them. Setup configures **dev and preview only**
project defaults and the selected dev deployment. Other existing deployments need a
separate update. Switching auth environments invalidates the old environment's
user IDs and sessions; remove stale admin grants and sign in to the shared environment. Shared
auth also means shared login policies and users: use a separate auth environment for
experiments that change those. No environment should use a bypass-auth flag.

## Release verification

Before merging the authentication foundation, verify login, the demo query, logout,
and denied access in a Vercel preview as well as locally. In particular:

- Register sign-out URLs separately in WorkOS. `signOutAdmin` supplies the current
  configured origin explicitly; that return URL must be allowed.
- Login must begin and finish on the same web origin for its host-only PKCE cookie.
  Check both the branch URL and a unique deployment URL to verify canonicalization.
- Verify two preview branches together, since one successful preview does not prove
  that another build preserves its callbacks and sign-out behavior.
- Prove anonymous and non-admin direct calls to `admin.demo` fail, and that the
  allowed identity succeeds. Missing `ORCA_ADMIN_USER_ID` must continue to deny all.

Production initially denies all admins. Enable the chosen WorkOS login method,
create the real admin account, authorize its ID on production, and repeat the smoke
test before adding sensitive functions. Those are explicit deployment setup steps,
not side effects of signing up or building the application.
