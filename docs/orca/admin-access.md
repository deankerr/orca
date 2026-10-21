# Administrator access

`/admin` and protected Convex functions authorize only the WorkOS subject in `ORCA_ADMIN_USER_ID`.

- An unset administrator denies access; dashboard membership grants no application access.
- The public viewer query exposes only the caller's subject and admin status, identifying unapproved accounts.

## Development login

Dev/preview share users and login policy. Experiments that change either need a separate WorkOS environment.

1. Retrieve development credentials with `convex env get` against the intended deployment; keep secrets out of output.
2. Sign in at `/admin`; use the account menu to sign out.

Credential variables are recorded in `config.md`. Restart failed authentication at `/admin` because
callback codes and PKCE state are single-use. Unlisted logout destinations fall back to WorkOS's default URL.

## Browser origins

Login starts on the configured callback origin so the host-only PKCE cookie returns to the same host.

| Context                | Browser origin                                   |
| ---------------------- | ------------------------------------------------ |
| Preview deployment URL | Sign-in redirects to the branch hostname.        |
| Portless startup       | Supplies the local or tailnet origin.            |
| Direct Convex push     | Set `ORCA_DEV_URL` to the browser-facing URL.    |
| Local URL lookup       | Run `bun run --silent dev:origin` from the root. |
| Remote access          | Use the running server's printed Tailscale URL.  |

## External configuration

- Convex manages callback and CORS registration.
- WorkOS owns login methods, signup policy, and logout allowlists.
- Production uses a separate WorkOS environment with GitHub OAuth and disabled signups.
- GitHub uses WorkOS's provider callback and its default `user:email` scope.
- Environment values and maintained sign-out origins live in `config.md`.
