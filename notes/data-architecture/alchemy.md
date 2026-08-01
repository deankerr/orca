# Alchemy + Effect

Gotchas and recipes for `alchemy@2.0.0-beta.64` and `effect@4.0.0-beta.99`. Things the docs do not
say, or say somewhere you would not look.

## Workers

- With `main: import.meta.url`, the file's **default export must be the Worker**:
  `export default class X extends Cloudflare.Worker<X>()(id, props, init) {}`. A factory function
  (`export default function W(resources) { return Cloudflare.Worker(...) }`) deploys cleanly and
  then fails every request with `Cannot read properties of undefined (reading 'exports')` — the
  runtime resolves the default export as the Worker and finds a bare function.
- Consequently, resources belong **inside the Worker's init effect**, not passed in from
  `alchemy.run.ts`. Safe in both phases: yielding a Resource only builds a descriptor; provisioning
  happens in the deploy engine.
- The docs index (`alchemy.run/llms.txt`) is not an inventory of the provider. Check
  `node_modules/alchemy/src/cloudflare/` before concluding something needs `wrangler`.
- Worker names get a fresh random suffix on delete/recreate deploys, orphaning the previous
  service's log history —
  [#522](https://github.com/alchemy-run/alchemy/issues/522).

## Serving an HTTP API from a Worker

- A Worker's `fetch` can be a **Layer piped through `HttpRouter.toHttpEffect`**, so `HttpApi` works
  inside one. Alchemy's own state-store Worker does this
  (`node_modules/alchemy/lib/Cloudflare/StateStore/Api.js`) — the most useful example in the package.
- `HttpApiBuilder.layer` wants `Etag.Generator`, `Path`, `HttpPlatform` **and** `FileSystem`, none of
  which a Worker has. `Etag.layer`, `Path.layer`, `HttpPlatform.layer` and `FileSystem.layerNoop({})`
  satisfy all four; the filesystem is only ever reached by a file response, which an API like this
  never sends.
- ⚠️ `toHttpEffect` needs a `Scope`, and the `Effect<HttpEffect>` form of `fetch` may not require one.
  `Effect.flatten` moves the whole thing inside the request instead — the router is rebuilt per
  request, which is microseconds for a handful of routes.
- ⚠️ **Alchemy's bridge answers 500 to everything it catches.** `safeHttpEffect` logs the cause and
  returns `Internal Server Error`, so effect's convention of _reporting a 400 as a defect that knows
  how to render itself_ is lost: a request that fails schema decoding reads as an engine fault, and an
  unmatched route reads the same. `HttpServerError.causeResponse(cause)` is effect's own renderer for
  both — catch the cause, render it, and log only when the status is 5xx.
- ⚠️ Bindings require `RuntimeContext` **per call**, which cannot be provided while a Layer is being
  built — so a binding call inside an `HttpApi` handler makes the handler layer unbuildable.
  `RuntimeContext.phantom` is the escape hatch: `Layer.empty` typed as though it provides the service,
  erasing the requirement while the real one is found in the ambient context at runtime. Alchemy uses
  it on itself. Best applied once, at the module that wraps the binding, rather than at each caller.

## Queues

- Cloudflare retries **batches, not messages**. Per-message `retry()` is not a way out: Alchemy's
  `EventSource` acks the whole batch once the handler returns, so a message marked for retry and
  then acked is racing itself. Cloudflare does not document which call wins.
- `batchSize: 1` makes batch-level and message-level retry the same thing. Invocation count rises,
  throughput does not change — `maxConcurrency` is the dial.
- `consumeQueueMessages` wires both halves: the runtime listener and the deploy-time `Consumer`
  resource. No manual `Consumer` in `alchemy.run.ts`.

## R2

- Object metadata ceiling is **8,192 bytes** (not 2 KB). A `put` that exceeds it fails rather than
  truncating. The CF dashboard truncates metadata on display, so it is a poor home for anything you
  need to read.
- `list()` defaults to ~20 keys per page and caps at 1,000. Pass `limit`.
- `list()` returns **no `customMetadata` unless you ask**: `include: ['customMetadata']`. ⚠️ That
  option is missing from the `@cloudflare/workers-types` v4 that Alchemy resolves (v5 has it back), so
  a fresh object literal is rejected for it. Assign the options to a variable first — TS only checks
  excess properties on fresh literals — rather than casting.
- Listing is **forward-only**: no reverse, no `endBefore`. "The most recent key under a prefix" means
  walking every page to the end, or storing a pointer.
- ⚠️ The REST client silently drops `delimitedPrefixes`: `list({ prefix, delimiter })` returns
  empty `objects` **and** empty `delimitedPrefixes`, so a directory-style listing looks like an
  empty bucket. Affects the `*Http` and `*Local` layers; the native Worker binding is fine.
- R2 SQL has an HTTP API, easy to miss because every guide reaches for `wrangler r2 sql query`:
  `POST https://api.sql.cloudflarestorage.com/api/v1/accounts/<accountId>/r2-sql/query/<bucket>`
  with a `Workers R2 SQL Read` bearer token and `{ "query": "..." }`. Its response envelope is
  undocumented.

## Pipelines and Data Catalog

- `Cloudflare.Pipelines.{Stream,Sink,Pipeline}` and `Cloudflare.R2.DataCatalog` exist but are absent
  from the docs index.
- ⚠️ No update API: every property change is a **replacement**, including a stream's schema and
  format — which replaces the table. Prefer engine-generated names; create-before-delete collides
  on an explicit one.
- There is no Workers `pipelines` binding. Send over `stream.endpoint` with a `Pipelines Send`
  token.
- `__ingest_ts` is an automatic column on any Pipelines-written table. R2 SQL has `json_get_str` /
  `json_get_int` / `json_contains`, so a `json` column stays queryable.

## API tokens

- ⚠️ **An OAuth profile cannot create API tokens at all.** `AccountApiToken` needs the
  `API Tokens > Write` account permission, and Alchemy's OAuth scope catalogue has no
  token-management scope. Measured 2026-07-27: all three token resources failed `Unauthorized` on
  `POST /accounts/{id}/tokens`, taking every dependent resource with them. Fix: make the profile an
  **API token** credential carrying `API Tokens > Write`.
- Policies need the account id as a **literal** in the resource key, which no resource output
  supplies. Read it from the ambient environment — the double `yield*` is not a typo, the service's
  value is itself an Effect:

  ```text
  const credentials = yield* yield* Cloudflare.CloudflareEnvironment
  const account = `com.cloudflare.api.account.${credentials.accountId}` as const
  ```

  (Fenced as `text`: the formatter rewrites `yield*` to `yield * yield *` in a `ts` block.)

- These are REST tokens, not S3 key pairs. An S3 client needs `accessKeyId` = token id and
  `secretAccessKey` = sha256 of the value; Alchemy derives neither.
- `Alchemy.Random('Name')` is the equivalent for a secret that is ours: generated once, persisted in
  stack state, injectable as a binding.

## Effect v4 differences

- `Effect.catchAll` is gone — it is `Effect.catch`.
- `Schema.Struct` **strips** keys it does not name. Decoding and re-encoding through one silently
  drops data. Use it as a gate and keep the original value, or use `Schema.Record(Schema.String,
Schema.Unknown)`, which preserves every key.
  (`decodeUnknownEffect(schema)(input, { onExcessProperty: 'preserve' })` keeps them, if the extra
  keys should survive a decode rather than a gate.)
- `Effect.retry({ schedule, times, while })` — `while` scopes which errors retry, so a typed error
  can be retried while others pass straight through.
- Filters are constructors: `Schema.check(Schema.isInt(), Schema.isBetween({ minimum, maximum }))` —
  called, and the range takes an object.
- `Effect.Effect.Success<…>` is `Effect.Success<…>`, and schemas have no `make`/`makeUnsafe`: a branded
  value comes from a decode, which is the point of branding it.
- oxlint false positives worth an inline disable: `Effect.map(effect, fn)` trips
  `unicorn/no-array-method-this-argument` (use `.pipe(Effect.map(fn))`), and `Effect.catch` trips
  `promise/prefer-await-to-then`.

## Testing

- An `HttpApi` can be driven without a server: provide `HttpServerRequest.fromWeb(new Request(url))`
  to the handler effect and map the result through `HttpServerResponse.toWeb`. `apps/engine/test`
  exercises every route this way against a `Map` pretending to be R2.
- ⚠️ `bun:test`'s `toMatchObject` **leaves `expect.any(…)` behind in the received object**. Reading a
  value out of that object afterwards gets the matcher, not the value — read first, then assert.

## Debugging

- `bunx alchemy logs --since 90m` from the app directory. Plain text, includes queue-consumer logs.
- `bunx alchemy state get --stack <Stack> --stage <stage> --fqn <Resource>` for URLs, bucket names
  and account ids — no hardcoded values, no env file.
- `bunx alchemy deploy --yes` in a non-interactive terminal; otherwise it asks for approval and
  cannot get it.
- The Cloudflare observability MCP's events view errors on any event lacking an `outcome` field;
  its calculations view works.
- `bunx wrangler` is broken in this repo's environment (`Cannot find module 'esbuild'`). Nothing
  needs it.
