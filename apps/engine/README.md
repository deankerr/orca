# engine

Fetch OpenRouter's model catalog on a schedule, fan the models out over a queue, and store each
endpoints response as its own file in R2.

```
cron (hourly)                  queue                       R2
     │                           │                          │
     ├─ GET /catalog/models      │                          │
     ├─ put ────────────────────────────────────────────────►│  catalog/{batch}.json
     ├─ drop unavailable + ~aliases                         │
     └─ sendBatch ──────────────►│                          │
                                 ├─ GET /stats/endpoint      │
                                 └─ put ────────────────────►│  endpoints/{batch}/{author}.{model}.{variant}.json
                                                             │
                                 └─ parse ScopeObservation (ids + raw payloads)
                                    └─ always put ─────────────────────► D1 current cache
```

D1 holds the disposable **current cache**: latest `ScopeObservation` per model-variant scope
(identity-validated endpoint ids + raw OpenRouter payloads — not product / orca-legacy cards).
After each successful endpoints observation is stored in R2, the queue consumer parses ids and
**always puts** the observation. D1 failures are logged and swallowed so they never block archive
capture. Product delivery (`planTransition` → Convex) is a later cut. Migrations live in
`./migrations` and apply on deploy via Alchemy + Effect SQL (`alchemy/SQL/D1` → `@effect/sql-d1`).

A crawl is 430 of 817 catalog models, ~100 seconds, ~6.9 MB of responses.

## Keys

A batch is named by the UTC moment its crawl started, ISO-8601 with the colons dashed out:

```
catalog/2026-07-27T04-33-43Z.json
endpoints/2026-07-27T04-33-43Z/anthropic.claude-4.7-opus-20260416.standard.json
```

The format is the index — every level of narrowing is a longer prefix, and lexicographic order is
chronological order:

| prefix                                      | selects                         |
| ------------------------------------------- | ------------------------------- |
| `catalog/`                                  | every crawl, cheaply enumerated |
| `endpoints/2026-07/`                        | a month of crawls               |
| `endpoints/2026-07-27/`                     | a day of crawls                 |
| `endpoints/2026-07-27T04-33-43Z/`           | one crawl                       |
| `endpoints/2026-07-27T04-33-43Z/anthropic.` | one author within it            |

Each batch is one level deep. The author is part of the filename because it has no independent
existence in this data — nothing is ever fetched per-author. The variant is a suffix because
variants are rare (411 standard, 18 free, 1 thinking in a July 2026 crawl) though they remain
separate units with different endpoints, and were common in the 2025 archive.

The `.` separators read but do not parse: model names contain their own dots (`gpt-3.5-turbo`).
`permaslug` and `variant` are in object metadata for machines.

**Batch-major.** R2 offers one lookup mechanism, so whatever the prefix does not answer becomes a
scan. This layout spends it on one crawl and on two crawls diffed. One model across many crawls is
the scan. That is the trade while R2 is the archive and something downstream is the query surface;
if historical questions ever need answering here, the answer is a table format, not a different
directory layout.

## What is stored

OpenRouter's own document with one property added:

```jsonc
{
  "data": [ … ],        // or "error": { … } — theirs, untouched
  "headers": { "date": "…", "age": "306", "cf-cache-status": "UPDATING", … }
}
```

Headers are in the body because the dashboard truncates metadata, and they are the field most worth
reading: `date`, `age` and `cf-cache-status` are what say whether an observation is fresh or cached.
`set-cookie` is stripped — a bot-management cookie that changes on every response would make header
diffs between batches always differ.

Metadata carries what a listing can filter on without fetching the object:

| key           | example                            |
| ------------- | ---------------------------------- |
| `status`      | `200`                              |
| `observed_at` | `2026-07-27T05:52:50.140Z`         |
| `permaslug`   | `anthropic/claude-opus-5-20260723` |
| `variant`     | `standard`                         |

Every crawl stores the catalog it planned from at `catalog/{batch}.json`, before queueing anything.
It is the batch's denominator — the `endpoints/` prefix records what landed, the catalog records
what should have, including the models deliberately skipped.

Nothing here parses an endpoints response. The two schemas the crawl does read live in
`@orca/schema/openrouter.ts`.

## The modules

| path                       | knows                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `worker.ts`                | Cloudflare bindings, cron, queue consumer — wiring only            |
| `resources/*`              | Alchemy resource descriptors (`Responses`, `Endpoints`, `Current`) |
| `runtime/binding.ts`       | `RuntimeContext.phantom` + `orDie` at binding edges                |
| `crawl/plan.ts`            | catalog → batch denominator → queue work list                      |
| `crawl/process-message.ts` | one message: fetch → archive → current cache                       |
| `archive/store.ts`         | key grammar and R2 — the only module that touches either           |
| `current/observation.ts`   | pure ScopeObservation parse (ids + raw payloads)                   |
| `current/cache.ts`         | CurrentCache over Effect SQL — no OpenRouter, no R2                |
| `api/http.ts`              | HTTP surface as one `HttpApi` over archive + current               |
| `openrouter/client.ts`     | that OpenRouter exists                                             |

Resource **ids** (`Responses`, `Endpoints`, `Current`, Worker id `Worker`) are stack state — rename
only with a deliberate migrate. Stack outputs include `url`, `bucketName`, `queueName`,
`databaseName`.

The archive is the seam the crawl and API meet at: the crawl writes through it, the API reads
through it, and neither builds a key. `Archive.make` takes a bucket client rather than reaching
for one, so `test/api.test.ts` drives the whole API — real store, real keys, real schemas — against
~40 lines of `Map` standing in for R2. D1 current-view is a second seam (`Current.make(sql)`).

## The API

Declared once in `api/http.ts`, so the same description validates requests, encodes responses and
generates the OpenAPI document. `/docs` is that document, rendered.

| route                                   | answers                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `GET /batches`                          | every crawl, oldest first, `?limit=&cursor=`                 |
| `GET /batches/latest`                   | the most recent crawl, in detail                             |
| `GET /batches/{batch}`                  | one crawl: its catalog, and what landed at which statuses    |
| `GET /batches/{batch}/catalog`          | the stored catalog document                                  |
| `GET /batches/{batch}/endpoints`        | what landed, `?limit=&cursor=&author=`                       |
| `GET /batches/{batch}/endpoints/{name}` | one stored response, exactly as stored                       |
| `GET /current`                          | D1 current-cache row counts (scopes / endpoints / available) |
| `POST /crawl`                           | starts a crawl now                                           |
| `GET /docs`, `GET /openapi.json`        | the API describing itself                                    |

Three things about it are worth knowing before using it:

- **`name` is the file's own name** (`anthropic.claude-opus-5-20260723.standard`), which is what a
  listing hands back. Identity is `permaslug` + `variant`, and those are in each listed item —
  reconstructing a name from them means knowing that `/` becomes `.`, which is the archive's business.
- **`cursor` is R2's cursor**, opaque and forward-only. Absent (`null`) means the listing is done.
- **`author` narrows the prefix**, so it is a cheaper listing rather than a filtered one. There is no
  status filter for the same reason: it would be a scan, and scans belong downstream.

A batch id must be a timestamp (`2026-07-27T04-33-43Z`) and a name must be one key segment. Both are
parsed before anything is looked up, so a malformed one is a `400` and can never become a prefix.

## Failures

**Transient** (429, 5xx): a fact about the moment. Retried 3× over ~7s before we settle for it.
**Settled** (everything else): a fact about what we asked for. Returned immediately.

**Endpoint errors are stored inline**, at the normal key, with the status in metadata. The endpoints
API has no way to say _zero endpoints_ — a model losing its last one answers 404, as does four going
to zero. Absence has no representation, so the error is sometimes the only encoding of a real state.
And since we only ask about models the catalog said were available, a 404 means the catalog and the
endpoints API disagreed.

**A failed catalog is stored nowhere.** It is an observation of us, not of OpenRouter, and belongs
in an alert. Anything still non-200 after retries kills the crawl, and no batch exists.

## Running it

```bash
bun run --cwd apps/engine dev
```

Then `/docs` for the API, `POST /crawl` to fill it. The API's own tests need nothing running:

```bash
bun run --cwd apps/engine test
```

Alchemy and Effect gotchas hit while building this are in
[notes/data-architecture/alchemy.md](../../notes/data-architecture/alchemy.md).

## Known and deferred

Understood, deliberately not acted on. Roughly in order of when it will matter.

- **The catalog response is 4.0 MB** — ~35 GB/year hourly, against ~60 GB/year for all endpoint
  files combined. It compresses hard; gzipping just the catalog would take most of it back.
- **`GET /batches/latest` walks `catalog/` to its end**, because R2 lists forward only — one request
  per 1,000 crawls, so one per 41 days of hourly crawling. When that stops being cheap the answer is
  a pointer object, not a cleverer listing.
- **`GET /batches/{batch}` counts by scanning the batch**, one page of 1,000 against ~430 objects.
  Fine now; a crawl that outgrows a page turns one request into several.
- **A failed catalog is an alert with nowhere to go.** The policy is decided; nothing is wired up.
- **No auth on anything**, `POST /crawl` included — the one route with a cost attached.
- **No dead-letter queue**, so a message that exhausts its retries is dropped. This is the only way
  an endpoint observation goes missing without a trace, since settled errors are stored.
- **Nothing can diff batch N against N−1** — cadence is irregular and completeness is not
  guaranteed, so N−1 may be partial for a given model. Comparison has to be against the most recent
  batch in which that model was observed, which belongs to the derivation layer.
- **D1 current cache is always-put only** — no planTransition, product delivery, or unavailability
  pass yet. Those land after the pure modules exist with tests.
- **No product field selection on the cache path** — raw observation payloads; eligibility and
  compare-view ignore policy are later pure steps, not SQL.
- **Concurrency and cadence are guesses** (4 in flight, hourly).
