# Proposed Direction

Everything starts with a new capture and artifact storage strategy that lets us freely chain
(and unchain) processes. Layers are ordered by how much domain knowledge they require — Layer 0
needs almost none, and each layer above can be built, versioned, and discarded independently.

## Layered artifact model

**Layer 0 — capture.** A Cloudflare Worker (cron + Workflows) collects from OpenRouter and writes
what it receives to R2, per crawl, append-only. Verbatim-ish: light processing to discard the
ridiculous embedded records (model → endpoint → model) is fine, but no interpretation — gzip
already collapses most of the redundancy (10.8 MB → 0.9 MB), so stripping is a cleanliness
decision, not a cost one. Per-request failures are recorded explicitly alongside the successes,
so a transient fetch failure can never read as an entity disappearing (the current pipeline's
`failedModelKeys` patch-around, made first-class). This layer does as close to nothing as
possible, because it's the only layer where a bug is unrecoverable.

**Layer 1 — canonical.** A versioned processor brings raw crawls to a shared baseline:
dedupe entities by natural key, split ephemeral telemetry (`stats`, `status_heuristics_*`) from
durable fields, and apply _era adapters_ — small per-range adjustments that reconcile the schema
eras present in the historical data. Output lives under a processor-version prefix
(`canonical/v4/...`); "apply a schema change retroactively" = bump the version, re-run over
Layer 0, flip a manifest pointer. Nothing is migrated in place.

**Layer 2 — derived products.** Pure functions of canonical artifacts, each independent and
disposable: changesets between crawls, the "current view" push to Convex, Monitor change
batches, webhook/Discord alerts, per-entity history documents, Parquet exports. Adding a product
is adding a reader; removing one is deleting a prefix.

Sketch of the R2 layout:

```
raw/<captured_at>/models.json.gz                 # verbatim catalog/models response (ISO id)
raw/<captured_at>/observations/<part>.jsonl.gz   # one self-describing observation per line
raw/<captured_at>/capture.json                   # pass summary: status tally + error scopes
canonical/v4/<captured_at>/catalog.json.gz       # deduped MEPs at shared baseline
canonical/v4/<captured_at>/telemetry.json.gz     # per-pass ephemeral stats
derived/changesets/v4/<prev>_<captured_at>.json.gz
derived/analytics/**/*.parquet                   # ad-hoc DuckDB lane, compacted whenever
manifest.json                                    # active versions, era boundaries, pass index
```

An observation line is `{slug, permaslug, variant, at, status, body}` or `{slug, permaslug, variant, at, error}` —
the unit of truth is the request scope, not the pass. Any HTTP response is data (404 = "zero
endpoints right now", uninterpreted until canonical); only transport errors are error records, and
an error never advances a scope's knowledge — it just leaves it stale until the next pass.

## Per-crawl workflow

Cloudflare Workflows gives durable, retryable, idempotent-by-`crawl_id` steps:

1. **fetch** — crawl OpenRouter with bounded concurrency (not ~800 sequential requests) → `raw/`.
2. **canonicalize** → `canonical/<version>/<crawl_id>/`.
3. **diff** — against the previous crawl's canonical artifact → changeset (usually near-empty).
4. **notify** — non-empty changeset → Convex HTTP mutation with the small, already-shaped delta.
5. **alert** — Discord/webhooks from the same changeset, via Queues.

One pipeline means the current strict/loose validation mismatch (catalog updates while the
change feed silently stalls) can't recur — it advances or visibly fails at a step. Backfill is
the same workflow parameterized over a crawl range, reading Layer 0 instead of fetching — which
is also the bootstrap: the ~12–13k existing bundles export through the archive-sync route into
`raw/`, with one era adapter for the old bundle envelope.

## Key principles

- **Raw is the only trustworthy baseline.** The source schema drifts silently (`variable_pricings`
  died unannounced), so deltas, dedupe decisions, and noise filters are all _derived_ and
  versioned — never the source of truth. Changed our mind about what counts as noise? Re-derive.
- **Deltas are compression, not truth.** The 12 h experiment: 32 KB of changeset vs ~65 MB/day of
  stored bundles — a keyframe + delta representation is ~200× smaller with no information loss.
  But it only makes sense as a Layer 2 product _within_ one processor version; diffing across
  versions is meaningless.
- **Canonicalize before diffing.** Drop the derived pricing mirrors (`display_pricing`,
  `pricing_json`, `pricing_version_id`) so one real change is one changeset entry, not four.
- **History replays forward.** Per-entity history (pricing first) regenerates from keyframe +
  changesets when the diff step sees a change — no backward reconstruction, no 20k-doc cap, no
  forget-on-create hack.
- **Collection and interpretation are independently versioned, deterministic, idempotent.**
- **Local and experiment-friendly.** Processors run on a laptop against real artifacts —
  `packages/processes/src/unbundle.ts` is already the seed of this workflow.

## Roles

- **Worker (Cloudflare):** capture, canonicalize, diff, notify Convex of relevant changes,
  dispatch webhook alerts — with real workflow primitives (durable steps, retries, queues).
- **Convex:** only what benefits from its live serving model — current catalog views, monitor
  feed, subscriptions. It receives small, already-shaped facts; no blob storage, no bundle
  decompression, no historical authority. Long-term, nothing under `convex/snapshots/` survives.
- **Frontend:** never touches raw artifacts. Historical product features are an open question —
  candidates include Convex-served projections or precomputed per-entity artifacts served
  through the Worker (cacheable, uncapped).
- **Parquet/DuckDB:** Dean's personal lane for maintenance and insight-hunting. DuckDB reads
  Parquet straight off R2 with range requests; the export is a Layer 2 product that can be
  generated whenever, wherever — including locally. Not in the serving path.

## Open questions

- Layer 0 specifics: exact key layout, per-request vs per-crawl artifact granularity, retention
  policy for full raw responses (gzip makes keep-everything cheap, but it's a choice, not a
  necessity), failure/diagnostic recording, manifest semantics (the one piece of coordination
  state — written last, wins; consumers never LIST R2).
- Noise policy: which pricing drift is signal? Sub-% `discount` flapping is ~60% of current
  change volume — quantize it, or route it to the telemetry track? Versioned like everything
  else, so the decision is revisable retroactively.
- Telemetry as a product: `stats`/`status_heuristics_*` are discarded today but are the natural
  latency/throughput history feature — a few floats per endpoint per crawl in columnar form.
- How historical data reaches the product (if/when it does).
- What, if anything, the new system eventually feeds back into the existing Convex tables —
  integration is optional, not assumed.

## Next steps

1. **Spin up Layer 0.** It has open challenges of its own, and a running collector makes the
   remaining questions concrete instead of speculative.
2. **In parallel: explore the existing dataset** via a snapshot dump from the Convex backend
   (~12–13k archives, Aug 2025 → present, varying cadence and schema eras). This both informs
   era adapters and seeds any future backfill.
3. No rush, no big-bang: the existing system keeps running; the new one runs in shadow until
   its derived layer earns trust. A good first proof: regenerate a model's full pricing history
   from keyframes + changesets and compare it against what the app serves today.
