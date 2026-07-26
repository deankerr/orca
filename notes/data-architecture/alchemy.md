# Alchemy

## Set up prompt (for reference only)

```
Help me build an Alchemy app on Cloudflare. Start by reading https://alchemy.run/getting-started and follow it exactly: scaffold a fresh project, install the dependencies, create the `alchemy.run.ts` Stack with a single Cloudflare R2 Bucket (no Worker yet), and run `alchemy deploy` so I sign in to Cloudflare and provision the Bucket. Confirm the Bucket is live before moving on.

Tutorial — foundations, work through whichever parts I haven't touched:
  https://alchemy.run/cloudflare/tutorial/part-1  First Stack (state store + first resource)
  https://alchemy.run/cloudflare/tutorial/part-2  Add a Worker
  https://alchemy.run/cloudflare/tutorial/part-3  Testing
  https://alchemy.run/cloudflare/tutorial/part-4  Local Dev (`alchemy dev`)
  https://alchemy.run/cloudflare/tutorial/part-5  CI/CD (per-PR previews from GitHub Actions)

For everything else (Cloudflare deep-dives, guides, concepts), fetch https://alchemy.run/llms.txt — it's the index of the guide and concept docs. Use it to look up the specific page you need instead of guessing URLs. The per-resource API reference is indexed separately in https://alchemy.run/llms-full.txt — it's large, so only fetch it when you need a specific resource's reference page.

Important:
- Confirm with me before each deploy. Don't batch.
- Do NOT instruct me to export CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN. Alchemy stores credentials in profiles — `alchemy login` (or the first `alchemy deploy`) prompts interactively for OAuth or an API token and saves it to ~/.alchemy/profiles.json.
- Use `bun alchemy deploy` (or the npm/pnpm/yarn equivalent).
```

## Issues

### 1. Every workflow run emits a spurious `outcome: exception` event

**Symptom.** One `eventType: workflow` / `outcome: exception` observability event per cron tick,
seconds after `capture started`, with no cause logged (`tapCause(logError)` never fires). The
instance then completes normally — `instance.status()` reports `complete` with correct output.

**Mechanism.** `WorkflowBridge.run()` runs the body via `Effect.runPromiseExit` and ends with
`throw Cause.squash(exit.cause)` on failure. Cloudflare's workflow engine aborts invocations as
control flow (hibernation between checkpoints, pause, retry scheduling) by rejecting the
in-flight promise; the bridge's callback-only `Effect.tryPromise` wraps that rejection into
`Cause.UnknownError` and rethrows it, so the runtime records the invocation as an exception. A
later invocation replays from checkpoints and completes.

**Upstream.** Same adapter defect as
[alchemy-run/alchemy#930](https://github.com/alchemy-run/alchemy/issues/930) (reported for
`pause` becoming `errored`). Open as of beta.64; upgrading doesn't help yet. Source:
`src/Cloudflare/Workflows/WorkflowBridge.ts` (`tryPromise` wrappers ~154, rethrow ~103).

**Impact on us.** Error-level observability events are untrustworthy for alerting — a real
workflow failure looks identical at the event level. Distinguish via logs (we should log the
pass summary from inside the workflow) or `instance.status()`.

### 2. "An RPC result was not disposed properly" warning on every `create()`

**Symptom.** One warning per cron tick, ~15s after instance creation.

**Mechanism.** `wrapInstance` in `src/Cloudflare/Workflows/Workflow.ts` wraps the native RPC
stub returned by `binding.create()` / `get()` but never calls `dispose()` on it.

**Upstream.** No existing issue found (searched "disposed", "workflow", "cron", "exception",
"outcome" in alchemy-run/alchemy). Candidate for us to file.

### 3. The REST R2 client silently drops `delimitedPrefixes`

**Symptom.** `bucket.list({ prefix: 'raw/', delimiter: '/' })` returns `objects: []` and
`delimitedPrefixes: []` — but `truncated: true` with a cursor, and paginating to exhaustion
yields nothing at all. A directory-style listing looks like an empty bucket.

**Mechanism.** `delimiter` is forwarded to the API, which duly collapses the keys into delimited
prefixes and returns no objects — then `src/cloudflare/R2/ReadBucketHttp.ts` (~137) builds its
result with `delimitedPrefixes: []` hardcoded and reads only `res.result`. The collapsed
prefixes are dropped on the floor. Affects the `*Http` and `*Local` layers (they share
`makeReadR2HttpClient`); the native Worker binding is unaffected.

**Upstream.** No issue found. Candidate for us to file.

**Impact on us.** None worth working around — `mirror` lists `raw/` flat and recovers pass ids
from the keys. Note the default page size is ~20, so pass `limit: 1000`: 2041 objects is 3 pages
(~5 s) instead of 103 (~60 s).

### Reading R2 from a standalone script

`bun run mirror` reads the artifact bucket from a plain Bun script with the **local Alchemy
profile's credentials** — no API token to mint, store, or rotate. The recipe, since it isn't a
documented path (the `*Local` layers are written for `Alchemy.Action`, which runs during
apply, not on demand):

- Build the client directly with `Cloudflare.R2.makeReadR2HttpClient(auth, bucketName,
jurisdiction)`; `auth.authorize` is `(effect) => effect.pipe(Effect.provideContext(context))`
  over a captured `Effect.context<Credentials | HttpClient>()`.
- Provide `Cloudflare.CloudflareApiLive()` + `FetchHttpClient.layer`, over `BunServices.layer`
  (profile reading needs `FileSystem`) and `Layer.succeed(AuthProviders, {})` — without the
  latter you get `Service not found: AuthProviders`.
- The client's ops declare `RuntimeContext` in `R` (it exists for in-stack callers). Nothing on
  the read path touches it, so the program runs fine once the requirement is discharged at the
  type level.
- Bucket name and account id come from stack state: `alchemy state get --stack OrcaCapture
--stage <stage> --fqn Artifacts` returns them under `attr` — no hardcoded ids, no env file.

### API tokens

Alchemy models Cloudflare API tokens as resources — `Cloudflare.ApiToken.AccountApiToken` /
`UserApiToken`, with a typed permission-group catalog (`Workers R2 Storage Read`, the
bucket-scoped `Workers R2 Storage Bucket Item Read`, and so on). The token value is returned by
Cloudflare once and persisted in stack state as `Redacted`, so it can be piped into e.g. a
GitHub secret. The R2 `*Http` layers already use this to mint their own least-privilege token.

Two things it does not do: these are **REST** API tokens, not S3 key pairs (an S3 client needs
`accessKeyId` = token id, `secretAccessKey` = sha256 of the token value — Alchemy derives
neither, and only `BucketSippy` consumes an `accessKeyId`, for a _source_ bucket). We need
neither today; a DuckDB-reads-Parquet-off-R2 lane later is the case that would.

### Related

- [alchemy-run/alchemy#522](https://github.com/alchemy-run/alchemy/issues/522) — workflow names
  not stage-scoped; recreates are destructive. Explains why the worker gets a fresh random
  suffix on delete/recreate deploys (12:11 on 2026-07-23), orphaning the previous service's log
  history in observability.

### Debugging fast paths

- Logs: `bunx alchemy logs --since 90m` (from `apps/capture`).
- Instance status: `GET https://<worker>.dean-kerr.workers.dev/capture/<instanceId>`.
- Worker URL: `bunx alchemy state get --stack OrcaCapture --stage dev_dean --fqn Worker`.
- Artifacts bucket name/account id: same command with `--fqn Artifacts` (the `attr` object).
- The observability dataset's workflow exception events carry no cause; the Cloudflare
  dashboard's workflow step view is the only place step-level errors surface.
