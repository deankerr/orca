# Module design: engine and schema

A design pass over the new code — `apps/engine` and `packages/schema` — in the vocabulary of
**module / interface / seam / depth**. What it changed, and what it deliberately left alone.

Measured 2026-07-27, against `apps/engine` at four modules and ~600 lines.

## The shape

```
worker.ts     Cloudflare: bindings, the cron, the queue consumer, the crawl it plans
  ├── api.ts        one HttpApi over the archive          ─┐
  ├── artifacts.ts  the archive: keys, R2, metadata        ├── @orca/schema/artifacts.ts
  └── openrouter.ts the only module that knows OpenRouter ─┘        the shared vocabulary
```

Three seams, each with a reason to exist:

| seam                     | crosses                                      | why it is there                             |
| ------------------------ | -------------------------------------------- | ------------------------------------------- |
| `Artifacts`              | everything ⇄ R2 and the key grammar          | two callers, one layout decision            |
| `OpenRouter`             | the crawl ⇄ an API we do not own             | upstream is the thing most likely to change |
| `@orca/schema/artifacts` | the engine ⇄ the shapes it stores and serves | one description, used in both directions    |

## What the pass changed

**The archive became a module.** The key grammar used to live in `worker.ts` as three template
functions, and the API would have needed a fourth to read keys back. Now `artifacts.ts` owns writing
_and_ reading, and no caller anywhere builds a key or names a prefix. Deletion test: delete it and
the grammar reappears in two places that must agree, plus R2's cursor protocol and the metadata
codec in each. It earns its keep.

**Its interface is eight members and no R2 in sight.** `putCatalog`, `putEndpoints`, `batches`,
`latest`, `detail`, `endpoints`, `readCatalog`, `readEndpoints` — each answering one question a
caller actually has. What stayed inside: the key grammar, `include: ['customMetadata']`, the
`truncated`/`cursor` duality, the metadata codec, cursor-following scans, and `RuntimeContext`. That
last one matters — Alchemy's R2 client asks every call for the Worker's ambient runtime, and letting
that requirement out would have put a platform service in the signature of every caller, including
the API's handlers, where it cannot be provided.

**`Artifacts.make` takes a bucket client rather than reaching for one.** That is the whole reason
`test/api.test.ts` exists: the real store, the real keys and the real schemas run against ~40 lines
of `Map`. Two adapters (the R2 binding, the fake) so the seam is real, not hypothetical.

**`OpenRouter.endpoints` stopped needing a second call.** It used to return a `Response` the caller
then handed to `document()` — an ordering constraint in the interface, and a `Response` type exported
for no other purpose. It now returns `{ status, body }`: one observation, in one call, because
storing one half without the other is never right. `Response` and `document` are internal now.

**The API is declared, not routed.** One `HttpApi` describes params, query, responses and errors, so
the same description validates requests, encodes responses, and generates the OpenAPI document at
`/openapi.json` — a surface that documents itself is one fewer thing to keep in sync. Two things had
to be added by hand for a Worker: a platform whose filesystem refuses every call, and a renderer for
respondable failures, because Alchemy's bridge answers 500 to everything it catches.

**Ids are parsed at one edge.** `BatchId`, `Permaslug`, `Variant`, `Author` and `ArtifactName` are
branded, pattern-checked schemas in `@orca/schema/artifacts.ts`. Upstream's shapes stay
`Schema.String` — that is what upstream sends — and the crawl turns one into the other. Everything
downstream takes the parsed type and re-checks nothing. This got load-bearing the moment the API
existed: two of those ids now arrive from an HTTP caller and end up in a storage key.

## What it left alone, and why

- **The crawl still lives in `worker.ts`.** `startCrawl` and `storeEndpoints` are the pipeline, and
  `worker.ts` is where the cron and the queue that trigger them are. Splitting them into `crawl.ts`
  would create a seam with one adapter on each side — indirection, not a seam. When a second trigger
  or a second planning strategy appears, cut it then.
- **`Artifacts` returns nine members rather than a smaller set.** `readCatalog`/`readEndpoints` could
  be one `read(reference)`, and the four navigation calls could be one `query(…)` with a discriminated
  argument. Both would shrink the surface and grow what a caller has to know to use it — depth is
  leverage per unit of interface learned, not member count.
- **`packages/schema/src/reference/*` is untouched.** It is not wired up yet, deliberately. One thing
  to know before it is: `canonicalizeEndpoint` restates every field of the canonical struct as an
  object literal, so the shape is written twice and the two can drift. When the reference schemas are
  picked up, that transform wants to be declarative — `Schema.decodeTo` with a transformation, or
  field-level `encodeKeys` for the `canPublish` → `can_publish` renames — so the struct stays the only
  place the shape is stated.
- **Errors are defects almost everywhere.** `Effect.orDie` on every R2 call, every encode of our own
  metadata, and `POST /crawl`'s whole effect. This is a choice, not an oversight: nothing calling the
  archive can do anything useful about a failed `put`, and a bug in data we wrote should be loud. It
  costs the ability to answer a caller precisely when R2 itself is unwell — a 500 with a logged cause
  is all they get.

## The one thing worth re-examining next

`api.ts` builds its router per request. The Worker's `fetch` can be an effect that produces the
handler once at init, but building it needs a `Scope`, and the only scope a Worker offers is the
request's. Rebuilding seven routes is microseconds and correct; pinning it to init would be faster
and would depend on nothing in the router's build being scoped. Worth measuring before believing
either version matters.
