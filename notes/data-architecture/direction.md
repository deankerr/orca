# Direction

The architecture, and the reasoning behind it. Everything rests on a capture and artifact storage
strategy that lets us freely chain — and unchain — processes.

Layers are ordered by **how much domain knowledge they require**. Layer 0 needs almost none;
each layer above can be built, versioned, and discarded independently of the ones above it. That
ordering is the whole design: it puts the code most likely to be wrong furthest from the code whose
mistakes are unrecoverable, and it means being wrong about interpretation costs a re-run rather
than a loss.

## Layered artifact model

**Layer 0 — capture.** A Cloudflare Worker (cron + Workflows) collects from OpenRouter and writes
what it receives to R2, per pass, append-only. Verbatim-ish: light processing to discard the
ridiculous embedded records (model → endpoint → model) is acceptable, but no interpretation — gzip
already collapses most of the redundancy, so stripping is a cleanliness decision, not a cost one.
Per-request failures are recorded explicitly alongside the successes, so a transient fetch failure
can never read as an entity disappearing. This layer does as close to nothing as possible, because
it is the only layer where a bug is unrecoverable.

**Layer 1 — canonical.** A versioned processor brings raw passes to a shared baseline: dedupe
entities by natural key, separate ephemeral telemetry (`stats`, `status_heuristics_*`) from durable
fields, carry per-scope evidence forward, and apply _era adapters_ — small per-range adjustments
that reconcile the schema eras present in historical data. Output lives under a processor-version
prefix (`canonical/<version>/…`), so "apply a schema change retroactively" means bump the version,
re-run over Layer 0, point consumers at the new prefix. Nothing is ever migrated in place.

Layer 1 parses every raw shape strictly, so upstream drift fails loudly rather than passing through
unnoticed, and emits flat snake_case rows — SQL-ready, because the queryable form downstream is
some flavour of SQL. What the entity shapes actually are, and the landmines in them, live in
[openrouter.md](openrouter.md), [provider-identity.md](provider-identity.md) and
[modality-split.md](modality-split.md).

**Layer 2 — derived products.** Pure functions of canonical artifacts, each independent and
disposable: the normalized store and its changesets ([normalized-store.md](normalized-store.md)),
the "current view" push to Convex, webhook and Discord alerts, per-entity history documents,
Parquet exports. Adding a product is adding a reader; removing one is deleting a prefix.

Sketch of the R2 layout:

```
raw/<captured_at>/models.json.gz                        # verbatim catalog response
raw/<captured_at>/observations/<part>.jsonl.gz          # one self-describing observation per line
raw/<captured_at>/capture.json                          # pass summary: status tally + error scopes
canonical/<version>/<captured_at>/entities.json.gz      # deduped entities at shared baseline
canonical/<version>/<captured_at>/observations.json.gz  # per-scope evidence, carried forward
canonical/<version>/<captured_at>/telemetry.json.gz     # per-pass ephemeral stats
derived/changesets/<version>/<prev>_<captured_at>.json.gz
derived/analytics/**/*.parquet                          # ad-hoc DuckDB lane, compacted whenever
```

`captured_at` is an ISO timestamp — sortable, readable, and the only identity a pass has.
Everything under `raw/` is immutable.

An observation line is `{slug, permaslug, variant, at, status, body}` or
`{slug, permaslug, variant, at, error}` — **the unit of truth is the request scope, not the pass.**
Any HTTP response is data (404 = "zero endpoints right now", uninterpreted until canonical); only
transport errors are error records, and an error never advances a scope's knowledge — it just
leaves it stale until the next pass. A pass is a scheduling artifact; there is no such thing as an
incomplete one.

⚠️ Per-scope evidence has to survive into Layer 1, not stop at Layer 0. Anything that decides an
entity has disappeared needs to know whether we actually looked and got an answer, and a canonical
artifact carrying entities alone cannot express that.

Retention of full raw responses is a choice rather than a necessity — gzip makes keep-everything
cheap at this volume — but it is the choice that keeps every layer above rebuildable, so it should
be given up deliberately if ever.

## Reaching the artifacts

Consumers need to discover and read passes they don't know the key of. Three positions:

**Interpretation never lives in Layer 0.** Recovering a model from its embedded copies, deduping
providers globally, reducing the catalog to a slug → has-endpoints map: all of that is
interpretation, and interpretation in Layer 0 is unversioned and unrepeatable over history. It
belongs at the front of canonicalization, where changing our mind about it costs a re-run. Layer 0
serves only bytes it wrote.

**Consumers read R2 directly.** No discovery routes on the capture Worker — no pass index, no
`latest`, no prefix resolution. Reading the bucket directly gives listing and ranged gets for free,
plus DuckDB straight off R2. A read API on the Worker is wanted eventually, but for the _product_,
not for our own processes; what it should serve is a question the derived layer answers, so it
waits until there's an answer.

**Use the platform's own mechanisms until they actually hurt.** LIST the bucket. Use whatever
Cloudflare already provides. No manifest, no pass index, no home-grown coordination state — those
are answers to problems we haven't got. Page limits, object counts and payload sizes are all
non-issues at current volume, and inventing structure before the constraint is real is how the
previous architecture got its shape.

A consequence, accepted: a pass isn't one object. We could repack, but multi-part is fine — a
reader that lists a pass prefix and streams its parts is written once.

## The pipeline

Cloudflare Workflows give durable, retryable, idempotent-per-pass steps, and the pipeline is the
same handful of stages every time:

1. **fetch** — crawl OpenRouter with bounded concurrency → `raw/`.
2. **canonicalize** → `canonical/<version>/<captured_at>/`.
3. **ingest / diff** — advance the normalized store; its version transitions _are_ the changeset.
4. **notify** — non-empty changeset → Convex, as a small already-shaped delta.
5. **alert** — Discord and webhooks from that same changeset, via Queues.

Two properties matter more than the specific stages. First, it is **one pipeline**: it advances or
it visibly fails at a step, so the failure mode where the catalog keeps updating while the change
feed silently stalls cannot recur. Second, **backfill is the same pipeline parameterized over a
pass range**, reading Layer 0 instead of fetching — which is also how the historical archive gets
in, with one era adapter for the old bundle envelope.

## Key principles

- **Raw is the only trustworthy baseline.** The source schema drifts silently, so deltas, dedupe
  decisions and noise filters are all _derived_ and versioned — never the source of truth. Changed
  our mind about what counts as noise? Re-derive.
- **Deltas are compression, not truth.** A keyframe-plus-delta representation is orders of
  magnitude smaller with no information loss, but it only makes sense as a Layer 2 product _within_
  one processor version; diffing across versions is meaningless.
- **Canonicalize before diffing — but prune at the diff point, not at ingestion.** Layer 1 keeps
  upstream views permissively, because we don't yet know which fields are signal. Redundancy noise
  is muted where the decision is versioned and revisable, not filtered out of the canonical record
  where it would be gone for good. Routing a field to a different lane is not pruning; dropping it
  is.
- **History replays forward.** Per-entity history regenerates from keyframes plus changesets as
  changes are seen — never reconstructed backwards from current state.
- **Collection and interpretation are independently versioned, deterministic, and idempotent.**
  Re-running any stage over the same input produces the same output and changes nothing else.
- **Measure the assumptions the design rests on.** Volume budgets, churn rates and rebuild costs are
  all load-bearing, and all of them can drift without warning. A number nothing is watching is a
  number that will be wrong quietly.
- **Local and experiment-friendly.** Processors run on a laptop against real artifacts. Anything
  that can only be exercised by deploying is harder to be right about.

## Working practices

- **Capture first, ask questions later.** We don't need an answer for every property up front. Push
  more data through before locking a decision in — there are landmines everywhere, and the archival
  back-catalogue is not even in the picture yet.
- **Strict at the boundary, permissive in scope.** Every raw shape is parsed with a strict schema —
  an unknown upstream key is a wanted signal, not an inconvenience. But _which_ fields to carry is
  decided permissively: when in doubt keep it verbatim and let cross-pass analysis classify signal
  versus noise later.
- **Dropped fields are documented drops.** Anything excluded from a canonical shape stays declared
  in the raw schema with a comment saying why (always-null, derivable, OR-internal wiring,
  marketing copy). The decision is visible at the boundary, not silently absent.
- **Never claim above the level of the evidence.** Endpoints override provider data policy, so no
  provider-level behavioural claim is trustworthy — the honest aggregate is "…on all of their
  endpoints", derived in Layer 2. Same logic anywhere an override exists.
- **Don't code paths for exotic upstream categories.** Providers charge however they want and
  OpenRouter models it as best it can; so do we. No special-casing one strange SKU — carry the
  labelled representation instead.
- **Verify hypotheses against a whole pass before acting.** Every "X is always Y" in these docs was
  checked across every scope and endpoint in a pass before being relied on, and the invariants that
  matter get enforced in code (throw on divergent model copies, on duplicate ids).
- **Platform first, mechanisms last.** Reach for what Cloudflare already gives us (LIST, bindings,
  the REST client, scoped tokens) before inventing indexes, manifests or coordination state. A
  built-in we outgrow is cheap to replace; an invented mechanism we outgrow is a migration.
- **Cheap disposable analysis tools over cleverness.** Slicing a pass into per-modality raw files
  took minutes and made the pricing families obvious. Prefer that over speculative abstraction.
- **Write the nuances down.** The knowledgebase exists so the next person (or Claude) doesn't need
  the current holder's head — facts, figures, landmines and open questions, annotated inline.
- **No big-bang.** The existing system keeps running; the new one runs in shadow until its derived
  layer earns trust. Trust is earned by reproducing something the current app already serves and
  comparing, not by inspection.

## Roles

- **Worker (Cloudflare):** capture, canonicalize, ingest, notify Convex of relevant changes,
  dispatch webhook alerts — with real workflow primitives (durable steps, retries, queues).
- **Normalized store:** the queryable index over canonical artifacts, and the authority for
  current state, history and changesets. Derived and rebuildable, never a system of record. See
  [normalized-store.md](normalized-store.md).
- **Convex:** only what benefits from its live serving model — current catalog views, monitor feed,
  subscriptions. It receives small, already-shaped facts; no blob storage, no bundle decompression,
  no historical authority. Long-term, nothing under `convex/snapshots/` survives. What, if
  anything, the new system feeds back into the existing Convex tables is optional, not assumed.
- **Frontend:** never touches raw artifacts. How historical features are served is open —
  candidates include Convex-served projections or precomputed per-entity artifacts served through
  the Worker (cacheable, uncapped).
- **Parquet/DuckDB:** the maintenance and insight-hunting lane. DuckDB reads Parquet straight off R2
  with range requests; the export is a Layer 2 product that can be generated whenever and wherever,
  including locally. Not in the serving path.
