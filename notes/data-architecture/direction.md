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

_Status (July 2026): drafted locally in `packages/processes` (`bun run canonicalize`) — one
module per entity (providers/models/endpoints), strict zod parse of the raw shape so upstream
schema drift fails loudly, flat snake_case canonical rows (SQL-ready; storage target is likely
SQL of some kind). Findings so far live in [openrouter.md](openrouter.md) (the guide),
[provider-identity.md](provider-identity.md), and [modality-split.md](modality-split.md)._

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

## Reaching the artifacts (decided July 2026)

Layer 1 needs to discover and read passes it doesn't know the key of. Three decisions:

**Dedupe belongs in `packages/processes`, not the Worker.** The Worker's `GET /raw/<captured_at>`
view — model recovered from its embedded copies, providers deduped globally, catalog reduced to a
slug → has-endpoints map — is _interpretation_, and interpretation in Layer 0 is unversioned and
unrepeatable over history. It moves to the front of canonicalization, where changing our mind
about it costs a re-run. Layer 0 goes back to serving only bytes it wrote.

**Processes read R2 directly; the HTTP API is deferred.** The Worker has no discovery routes
(no pass index, no `latest`, no prefix resolution), and adding them now would be building a
second access path for a consumer that runs on a laptop. Reading the bucket directly from the
scripts gives listing and ranged gets for free, plus DuckDB straight off R2 later. A read API on
the Worker is still wanted eventually — for the product, not for us — but the labs work
(canonicalize → diff → pricing drill-down) is the thing that earns knowledge right now, so it
waits until we know what it should serve.

**Use the platform's own mechanisms until they actually hurt.** LIST the bucket. Use whatever
Cloudflare/Alchemy already provides. No manifest, no pass index, no home-grown coordination
state — those are answers to problems we haven't got. (An earlier draft of this document
asserted "consumers never LIST R2, the manifest is the coordination state." That was never a
decision; it is struck.) Page limits, object counts, and payload sizes are all non-issues at
current volume, and inventing structure before the constraint is real is how the last
architecture got its shape.

A consequence, accepted: a pass isn't one file (`models.json.gz` + N `observations/*.jsonl.gz` +
`capture.json`). We could repack passes into a single object, but multi-part is fine — the
scripts get a dedicated reader that lists a pass prefix and streams its parts, written once.

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
- **Canonicalize before diffing — but prune at the diff point, not at ingestion.** (Revised
  July 2026: an earlier draft said to drop the pricing mirrors at Layer 1. Wrong layer.) Layer 1
  keeps all upstream pricing views permissively — `pricing_json` is the source of truth, but
  `display_pricing` is the only place exotic SKU semantics are labelled, and we don't yet know
  which fields are signal. Redundancy noise (one price change → four changeset entries) is muted
  in the diff process, where the decision is versioned and revisable — not filtered out of the
  canonical record where it would be gone for good.
- **History replays forward.** Per-entity history (pricing first) regenerates from keyframe +
  changesets when the diff step sees a change — no backward reconstruction, no 20k-doc cap, no
  forget-on-create hack.
- **Collection and interpretation are independently versioned, deterministic, idempotent.**
- **Local and experiment-friendly.** Processors run on a laptop against real artifacts —
  `bun run unbundle` is already the seed of this workflow.

## Working practices

How this stage of development actually runs (observed and intended):

- **Capture first, ask questions later.** We don't need an answer for every property up front.
  Push more data through before locking any decision in — there are landmines everywhere, and
  the archival back-catalogue isn't even in the picture yet. The pipeline is expected to be
  iterated on throughout this stage.
- **Strict at the boundary, permissive in scope.** Every raw shape is parsed with a strict
  schema — an unknown upstream key is a wanted signal, not an inconvenience (fail fast, loudly).
  But _which_ fields to carry is decided permissively: when in doubt, keep it verbatim and let
  cross-pass diff analysis classify signal vs noise later.
- **Dropped fields are documented drops.** Anything excluded from a canonical shape stays
  declared in the raw schema with a comment saying why (always-null, derivable, OR-internal
  wiring, marketing copy). The decision is visible at the boundary, not silently absent.
- **Never claim above the level of the evidence.** Endpoints override provider data policy, so
  no provider-level behavioural claim is trustworthy — the honest aggregate is "…on all of
  their endpoints", derived in Layer 2. Same logic anywhere an override exists.
- **Don't code paths for exotic upstream categories.** Providers charge however they want and
  OR models it as best they can; so do we. No special-casing "Image Output (moodboards)" —
  carry the labelled representation instead.
- **Verify hypotheses against a whole pass before acting.** Every "X is always Y" in these docs
  was checked with a one-liner over all 431 scopes / 1,052 endpoints before being relied on —
  invariants that matter get enforced in code (throw on divergent model copies, duplicate ids).
- **Platform first, mechanisms last.** Reach for what Cloudflare/Alchemy already gives us (LIST,
  bindings, the REST client, scoped tokens) before inventing indexes, manifests, or coordination
  state of our own. We don't yet know what we want; a built-in that we outgrow is cheap to
  replace, an invented mechanism we outgrow is a migration.
- **Cheap disposable analysis tools over cleverness.** Slicing the pass into per-modality raw
  files (`bun run split-modalities`) took minutes and made the pricing families obvious; prefer
  that over speculative abstraction.
- **Write the nuances down.** The knowledgebase ([openrouter.md](openrouter.md)) exists so the
  next person (or Claude) doesn't need the current holder's head — facts, figures, landmines,
  and open questions, annotated inline.

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
  necessity), failure/diagnostic recording.
- What the Worker's read API eventually serves, and to whom — deferred until the labs work says.
- Noise policy: which pricing drift is signal? Sub-% `discount` flapping is ~60% of current
  change volume — quantize it, or route it to the telemetry track? Versioned like everything
  else, so the decision is revisable retroactively.
- Telemetry as a product: `stats`/`status_heuristics_*` are discarded today but are the natural
  latency/throughput history feature — a few floats per endpoint per crawl in columnar form.
- How historical data reaches the product (if/when it does).
- What, if anything, the new system eventually feeds back into the existing Convex tables —
  integration is optional, not assumed.

## Next steps

1. ~~Spin up Layer 0~~ — done; capturing every 15 minutes in shadow since 2026-07-23.
2. ~~Draft Layer 1 canonicalization~~ — done for providers/models/endpoints (pricing carried
   permissively, telemetry excluded for a separate pipeline). Iterate as more passes flow.
3. ~~Give the processes a pass reader~~ — done. `bun run mirror` (apps/capture) lists `raw/`
   with the local Alchemy profile's credentials and copies whole passes to
   `packages/processes/input/raw/`; the dedupe moved out of the Worker into
   `canonicalize/pass.ts`. Two commands, both idempotent, no hand-saved files.
4. **Draft the diffing process.** No structural blockers. Key by natural keys
   (`slug`/`slug`/`id` — endpoint UUIDs are confirmed stable and globally unique, though
   providers occasionally delete-and-recreate under a new id); treat unobserved or errored
   scopes as stale, never as deletions. The first cross-pass diffs will answer the parked
   questions: `pricing_version_id` stability, and churn classification of the "maybe" fields
   (`default_order`, `updated_at`, `capacity_tpm`, `is_deranked`).
5. **Then the pricing drill-down**, informed by diff output — model pricing families
   (token/unit/duration/characters/search-units) starting from `pricing_json`.
6. **Explore the existing dataset** via a snapshot dump from the Convex backend (~12–13k
   archives, Aug 2025 → present, varying cadence and schema eras). This both informs era
   adapters and seeds any future backfill.
7. No rush, no big-bang: the existing system keeps running; the new one runs in shadow until
   its derived layer earns trust. A good first proof: regenerate a model's full pricing history
   from keyframes + changesets and compare it against what the app serves today.
