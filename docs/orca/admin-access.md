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

Update it when changing the hostname scheme or Vercel project/team. Preview sessions
belong to the branch hostname; sign-in redirects unique deployment URLs there.

## Local callbacks

For direct Convex pushes, supply `PORTLESS_URL` from `portless get orca`. Login must
begin and finish on that external origin. Restart failed attempts at `/admin`;
callback codes and PKCE state are single-use.

## Verify auth changes

Check login, `admin.demo`, and logout locally and on two preview branches. Confirm
anonymous and non-admin direct calls fail, including with `ORCA_ADMIN_USER_ID` unset.
Repeat on production after deploying auth changes.
