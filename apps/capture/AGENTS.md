# apps/capture

_Note: I am very new to working with Effect. Please make sure code is extra readable and documented with comments._

## Working with Alchemy

This app is managed by [Alchemy v2](https://alchemy.run) — infrastructure-as-Effect for
Cloudflare. It is **not** wrangler: there is no wrangler.toml, and bindings/config live in code.

### Key facts

- `alchemy.run.ts` is the stack entrypoint. Resources (R2 bucket, Worker, Workflow) are Effect
  values; yielding one in the stack (or binding it in a Worker) provisions it.
- **Stages**: deploys default to stage `dev_${USER}` (currently `dev_dean`). This is the
  design/dev environment, not production — a production stage comes later via
  `alchemy deploy --stage <name>`. Resource names are stage-suffixed.
- **Auth**: profiles in `~/.alchemy/profiles.json`, created interactively by `alchemy login` or
  the first deploy. Never export `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.
- **State**: `Cloudflare.state()` stores stack state in a small Worker + Durable Object on the
  Cloudflare account (bootstrapped once, shared across stacks). `alchemy state tree` inspects it.
- **Commands** (run from this dir): `bun run deploy` / `bun run dev` / `bun run destroy`;
  also `bunx alchemy deploy --dry-run` (plan), `state tree|list|get`, `tail`, `logs --since 15m`.
- `.alchemy/` is generated (bundles, logs, local state) and gitignored — never lint or edit it.
- **`dev` is local compute, remote state.** `alchemy dev` runs the Worker in `workerd` on this
  machine, but stateful bindings (R2, D1, …) are proxied to the _real_ stage resources — there is
  no local emulation. So `dev` still provisions buckets/databases and applies D1 migrations, and
  writes in dev are writes. Non-interactive `destroy` needs `bunx alchemy destroy --yes`.
- ⚠️ **Two `dev` processes silently fight over the port.** The second fails `pre-creating` with
  "Could not bind to port", reports "keeping dev alive so healthy resources keep serving", and
  leaves the _first_ Worker answering on that port — possibly bound to a database the second run
  just deleted. If a route starts returning "D1 database … has been deleted",
  `pkill -f "alchemy dev"`, confirm the port is free, then start a single instance.
- Versions are pinned to `alchemy@2.0.0-beta.x` + `effect@4.0.0-beta.x`; newest betas may be
  blocked by the repo's bun `minimumReleaseAge` (3 days) — pin the newest that clears the gate,
  and keep the effect packages within alchemy's peer range.

### Effect patterns and hard-won gotchas

- Workers/Workflows declare bindings by yielding them in the init generator, and the binding
  layer must be provided: `.pipe(Effect.provide(Cloudflare.R2.ReadWriteBucketBinding))` (same
  for `Cloudflare.Workers.CronEventSourceLive` when using `Workers.cron`).
- `HttpServerRequest.url` is the request **path**, not an absolute URL — `new URL(request.url)`
  throws.
- Workflow `task` return values are checkpointed via structured clone with a ~1 MiB cap:
  - never return large payloads (store them in R2, return counts/keys),
  - never return R2 results (`R2Object` carries a non-serializable `Checksums` → `DataCloneError`
    that fails the step _after_ its side effects succeeded) — `Effect.asVoid` puts.
- Always wrap I/O in `Cloudflare.Workflows.task` — outside a task it re-runs on every replay.
- Chunk large fan-outs into multiple tasks: each task gets its own subrequest budget, retry
  scope, and durable checkpoint.
- The workflow error surfaced to `instance.status()` is only a message (`UnknownError: An error
occurred in Effect.tryPromise`); the real cause is in the Cloudflare dashboard's workflow step
  view. `Effect.tapCause(Effect.logError)` before `orDie` helps.
- Some repo lint rules false-positive on Effect idioms (`unicorn/no-array-for-each` on
  `Effect.forEach`, `promise/prefer-await-to-callbacks` on `Effect.catchTag`) — inline-disable
  with a justification.

### Docs

- Getting started: https://alchemy.run/getting-started
- Tutorial: https://alchemy.run/cloudflare/tutorial/part-1 … part-5 (stack, worker, testing,
  local dev, CI/CD)
- Guide/concept index: https://alchemy.run/llms.txt (fetch this to find the right page)
- Per-resource API reference index: https://alchemy.run/llms-full.txt (large — fetch only for a
  specific resource)
- Frequently used: [Workflows](https://alchemy.run/cloudflare/compute/workflows),
  [Cron](https://alchemy.run/cloudflare/messaging/cron), [R2](https://alchemy.run/cloudflare/data/r2)
