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
```

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

### The disagreement window is wider than the crawl

```
catalog    cache-control: public, max-age=60, s-maxage=300, stale-while-revalidate=300
endpoints  cache-control: public, max-age=300, stale-while-revalidate=600, stale-if-error=3600
```

Two caches, unaware of each other, each up to 300s stale; `stale-if-error` can hand us an hour-old
body with a 200 on it. Crawling the entire catalog in one second would still produce 404s. This is
what `age` and `cf-cache-status` are for — a 404 may itself be stale.

## Running it

```bash
bun run --cwd apps/engine dev
```

- `POST /crawl` starts a crawl immediately.
- `GET /objects?prefix=endpoints/2026-07-27T04-33-43Z/` counts what landed.

Alchemy and Effect gotchas hit while building this are in
[notes/data-architecture/alchemy.md](../../notes/data-architecture/alchemy.md).

## Known and deferred

Understood, deliberately not acted on. Roughly in order of when it will matter.

- **The catalog response is 4.0 MB** — ~35 GB/year hourly, against ~60 GB/year for all endpoint
  files combined. It compresses hard; gzipping just the catalog would take most of it back.
- **`GET /objects` is a single unpaginated list.** R2 caps a page at 1,000 keys. Needs a delimiter
  for enumeration and pagination for detail.
- **Stored documents are re-serialised**, so byte-for-byte fidelity with upstream is gone. Value
  fidelity remains.
- **A failed catalog is an alert with nowhere to go.** The policy is decided; nothing is wired up.
- **No auth on `POST /crawl`.**
- **No dead-letter queue**, so a message that exhausts its retries is dropped. This is the only way
  an endpoint observation goes missing without a trace, since settled errors are stored.
- **Nothing can diff batch N against N−1** — cadence is irregular and completeness is not
  guaranteed, so N−1 may be partial for a given model. Comparison has to be against the most recent
  batch in which that model was observed, which belongs to the derivation layer.
- **Concurrency and cadence are guesses** (4 in flight, hourly).
