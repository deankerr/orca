# Administrator access

`/admin` and protected Convex entry points authorize the user selected by
`ORCA_ADMIN_USER_ID`. Each protected entry point calls `requireAdmin`.

## Development login

Retrieve `ORCA_DEV_ADMIN_EMAIL` and `ORCA_DEV_ADMIN_PASSWORD` with `convex env get`
from the selected deployment. Capture credentials into the login process without
printing them. Sign in at `/admin`; `admin.demo` confirms access. Sign out through
the header menu to resume anonymous work.

## Environments

Dev/preview share users and login policy. Use a separate WorkOS environment for
experiments that change these. Provisioning is covered in [setup](setup.md).

Convex registers callbacks and CORS. WorkOS owns login methods, signup policy, and
logout destinations. Production GitHub OAuth uses the provider callback shown by
WorkOS and its default `user:email` scope.

The shared logout allowlist contains:

- `https://orca.localhost/`
- `https://*.orca.localhost/`
- `https://orca-git-*-deank.vercel.app/`
- `https://fserv.bleak-scala.ts.net/`
- `https://fserv.bleak-scala.ts.net:8443/` through `:8450/` (eight explicit entries)

Update it when changing the hostname scheme or Vercel project/team. Preview sessions
belong to the branch hostname; sign-in redirects unique deployment URLs there.

The fserv entries cover Portless's nine preferred Tailscale HTTPS ports. Additional
ports or development hosts need explicit entries in WorkOS Applications → Redirects
→ Sign-out URIs. Keep the trailing slash to match the app's logout destination.
Convex's managed AuthKit configuration registers callbacks and CORS origins only.
WorkOS permits wildcard logout ports only on localhost/loopback; an unlisted
tailnet destination falls back to the default sign-out URL.

## Local callbacks

Web startup registers the callback for Portless's selected browser URL. For direct
Convex pushes, supply `ORCA_DEV_URL` from the root `bun run --silent dev:origin` for local access, or
the running server's printed Tailscale URL for remote access. Login must begin and
finish on that external origin. Restart failed attempts at `/admin`;
callback codes and PKCE state are single-use.

## Verify auth changes

Check login, `admin.demo`, and logout locally and on two preview branches. Confirm
anonymous and non-admin direct calls fail, including with `ORCA_ADMIN_USER_ID` unset.
Repeat on production after deploying auth changes.
