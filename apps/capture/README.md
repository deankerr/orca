# @orca/capture

Layer 0 of ORCA's new data architecture: a small Cloudflare Worker + Workflow that observes the
OpenRouter API and stores exactly what it sees in R2. It interprets nothing — it is the
unrecoverable layer, so it does as close to nothing as possible.

See [notes/data-architecture](../../notes/data-architecture/README.md) for the full design.
Currently deployed to the dev stage only — this is a design/dev experiment running in shadow
alongside the existing Convex pipeline.

## What it does

Every 15 minutes a capture pass runs:

1. Fetch the model catalog (`/api/frontend/v1/catalog/models`) and store it verbatim.
2. For each listed model+variant, fetch its endpoint stats (`/api/frontend/v1/stats/endpoint`),
   ~425 requests in chunked, durable workflow steps.
3. Write one **observation** per request — scope, its own timestamp, and what happened:

```jsonc
{
  "slug": "z-ai/glm-5.2",
  "permaslug": "z-ai/glm-5.2",
  "variant": "standard",
  "at": "2026-07-23T11:13:13.906Z",
  "status": 200,
  "headers": {/* verbatim response headers, minus set-cookie */},
  "body": {/* verbatim response */},
}
```

Any HTTP response is data — a 404 means "this model has zero endpoints right now", not an error.
Only transport failures (after quick retries) become error records, and an error never advances
knowledge of a scope; it just leaves it stale until the next pass. There is no such thing as an
incomplete pass — the pass is a scheduling artifact, and each observation stands alone.

⚠️ **Headers are part of the observation, and cannot be backfilled.** OpenRouter's API is behind
Cloudflare's cache, so `age`/`date` are the difference between "observed at `at`" and "observed
something generated minutes earlier" — every downstream timing claim rests on them. They are also
what tells us whether an unchanged response means the world stood still or that we were handed the
same cached object. `set-cookie` is dropped: credential material, never observation. The catalog is
one request, so its headers travel in `capture.json` rather than wrapping `models.json.gz`, which
stays the verbatim body its consumers expect.

📌 **What they turned out to say** (pass `2026-07-26T05:15`, 433 scopes, one colo). Polling every 15
minutes always lands past the endpoint cache's `max-age=300`, so we mostly force a revalidation and
get origin-fresh data: 82% `EXPIRED` + 3% `MISS` = **85% generated at the moment we asked**. 15% were
`HIT`, and ⚠️ Cloudflare sends no `age` on those — but a HIT is by definition inside `max-age`, so
they are bounded at 5 minutes old. One scope was `UPDATING` at `age: 897`. The whole 433-request
sweep spans **23 seconds**, so a pass is near-simultaneous. ⚠️ The catalog behaves differently — it
reports its age and was a `HIT` at `age: 282`, and with `s-maxage=300, swr=300` it can be 10 minutes
stale, which is a floor on discovery latency no polling interval can beat. ⚠️ Zero `etag` or
`last-modified` on any of the 433: conditional requests are impossible.

The `freshness` tally in `capture.json` records this per pass, so the question stays answerable
without re-downloading every body. The headers on each line remain the authority.

## Artifact layout

```
raw/<captured_at>/models.json.gz               # verbatim catalog response
raw/<captured_at>/observations/<part>.jsonl.gz # one observation per line, ~40 per chunk
raw/<captured_at>/capture.json                 # pass summary: status tally, error scopes,
                                               #   freshness tally, catalog status + headers
```

`captured_at` is an ISO timestamp (e.g. `2026-07-23T11:13:11.435Z`) — sortable, readable, and
the only identity a pass has. Everything under `raw/` is immutable and append-only; all
interpretation (canonicalization, diffing, change detection) happens in later layers that read
these artifacts and can be re-run at any time.

## Endpoints

- `POST /capture` — start a pass manually; returns `{ captured_at, instanceId }`
- `GET /capture/<instanceId>` — workflow status
- `GET /raw` — every key under `raw/`; `?startAfter=<key>` continues from one already seen
- `GET /raw/<captured_at>/<file>` — fetch one raw artifact verbatim (gunzips `.gz` for inspection)

The Worker serves only bytes it wrote, and a list of what it wrote. It still interprets nothing —
no `latest`, no pass index, no shaped answers — so nothing that could be wrong about a pass is
trapped in the unrecoverable layer. A read API for the product comes later, when we know what it
should serve.

## Reading artifacts

`scripts/` is where we work with what capture wrote. Nothing is mirrored — the shared modules fetch
on demand and each script builds on them:

- `artifacts.ts` — the keys and the bytes: `passes()`, `readText(key)`, `select()` (which pass or
  passes a script was asked for, spelled the same way everywhere), `forget()`.
- `pass.ts` — one pass reduced to the raw records upstream actually returned (`readPass`), plus its
  `capture.json` summary. Upstream embeds models and providers inside every endpoint; the copies are
  lifted out once and deduped by natural key, which is the same reduction `@orca/processes` does at
  the front of canonicalization. Nothing else is interpreted.
- `report.ts` — the HTML side: one self-contained file, no network, no build step. `page()` gives a
  report its stylesheet, chrome and embedded data; the report supplies the script that renders it.

```bash
bun run raw                              # latest pass, unzipped, into output/<captured_at>/
bun run raw --list                       # what passes exist (--list 100 for more)
bun run raw --last 10                    # the last ten passes, one directory each
bun run raw --scope glm --last 20        # one model over twenty passes, indented, ~20 KB each
bun run raw 2026-07-25T23 --last 4       # the last four passes of that hour
```

The argument says where to _end_ — a `captured_at` or any prefix of one, newest match wins — and
`--last` how far back from there. `--scope` fetches observations only: it skips the catalog, which
is 5.8 MB per pass and would otherwise dominate everything a multi-pass fetch downloads.

### `bun run fields` — what every raw field contains

An HTML report on every field of every raw entity in one pass, identified by the pass that produced
it (`output/fields_<captured_at>.html`). Nothing is stored but the report; the pass is read over the
wire and thrown away.

```bash
bun run fields                           # the latest pass, all four entities
bun run fields 2026-07-26T05             # that hour's newest pass
bun run fields --entity endpoints        # skips the 5.8 MB catalog fetch
bun run fields --last 3                  # one report per pass
```

It answers the questions canonicalization decisions are argued from: which fields have nothing to
model (one value, ever), which are closed value sets we can rely on, which are only describable by
shape, and how much of each is `null` versus **absent** — upstream means different things by the
two. Records are deduped by natural key, nested objects are recursed into as dotted paths, and a
container with an open key set is reported as a dictionary rather than exploded into a field per
key.

⚠️ **An array of objects is a set of records, not a value.** `display_pricing` summarised as one is
722 distinct JSON blobs, none of them readable — which is why it is the field that keeps breaking
things. Its elements are analysed at `display_pricing[]` like records of their own, and every count
under that path is **per element**: 3,006 SKU rows across 1,056 endpoints, `kind` with 2 values,
`unitLabel` with 14, `price` a _string_ with 656, and `tiers` present on only 320 of them — itself an
array of objects, so `display_pricing[].tiers[].price` is a row too. The array itself then reports
its lengths and which key sets its elements have (89% without `tiers`, 11% with). The element hop
costs no depth, so the nesting cap still means four levels of objects wherever they live.

HTML rather than Markdown because the answer set is ~310 fields carrying a full frequency table
each: the report ships all of it and the page filters (by path _or_ by value), sorts, and expands,
instead of a static document choosing in advance which 30 values matter. In path order the list is
drawn as a tree — indented by depth, with the context part of each path dimmed — so a container and
the fields inside it read as one thing; under any other sort that would be a lie, so it flattens.
Coverage bars, numeric histograms and per-category colouring make the comparisons readable at a
glance. `#<entity>/<path>` links to one field.

A histogram is only drawn when a field has 16 or more distinct numbers — below that its value table
is the exact distribution, and approximating a table you can read in full is worse than not drawing
it. Its bucket edges are always round (1/2/2.5/5 × 10ⁿ linear, 1-2-5 × 10ⁿ per decade on a log axis,
whole decades when that would run long), because `20000 – 50000` says something about a field whose
values are powers of two and `18400 – 32768` does not. Zero gets its own bucket on a log axis — it
can't sit on one, and in these fields it is a state ("no limit") rather than a small number.

There is nothing to configure. The Worker's URL comes from stack state on first use (one
`alchemy state get`, ~3s) and is cached with the key listing in `.artifacts-cache.json`
(gitignored). `CAPTURE_URL` points the scripts elsewhere — `alchemy dev` on localhost, another
stage — and `--refresh` drops the cache after a redeploy moved something.

Listing is worth caching because passes are immutable and their keys sort chronologically: the
cache holds every key up to the newest complete pass, and each run asks only for what came after
it (`/raw?startAfter=`).

**Why the Worker and not the bucket.** Reading R2 directly would be better — ranged gets, no
Worker in the path, and `rclone`/DuckDB for free — but it needs S3 credentials, and the stack
cannot mint them: Alchemy authenticates with a Cloudflare OAuth profile, and Cloudflare's OAuth
client offers no `api_tokens` scope, so `AccountApiToken` is refused. The only way there is a
token made by hand in the dashboard and remembered afterwards, which is worse than a route. (Not
the REST API either: it is limited to 1,200 requests per five minutes account-wide — the same
budget `alchemy deploy` spends — and Cloudflare points object operations at S3 instead.)

`bun run mirror` is the older path: it copies whole passes into `packages/processes/input/raw/`
for `@orca/processes` and the `@orca/store` prototype loader, over the REST API. It stays until
those stop being fed that way.

## Operating

Managed with Alchemy — see [CLAUDE.md](CLAUDE.md) for commands, stages, and gotchas.
