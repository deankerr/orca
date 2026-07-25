# The Normalized Store

How canonical entities are stored, and how the Engine and consumers read them. This is the
"Normalized Store" box in dean's draft architecture, worked through. Written 2026-07-25, before
any of it is built — the schema sketch is a **proposal**, the figures are measured.
Annotations: ❓ = open question, ⚠️ = landmine, 🔀 = alternative we considered.

## The property that makes the decision easy

The store is **derived**. Layer 0 artifacts are in R2 forever, canonicalization is deterministic
and versioned, so the store can be rebuilt from scratch at any time. It is a rebuildable index,
not a system of record.

That reframes the question. Not "which database do we commit to for five years" but "which is
easiest to rebuild into something else when we are wrong". Optimize for rebuildability and the
choice stops being frightening.

So "how do we store it" has two answers, and we want both:

- **Durable form — versioned artifacts in R2.** `canonical/v1/<captured_at>/{models,providers,endpoints}.parquet`.
  Immutable, cheap, DuckDB-readable off R2 with range requests, and the input to any rebuild.
- **Queryable form — a SQL database, explicitly a cache.** Artifacts cannot answer "what did
  endpoint X look like on 2026-03-01" or "give me current rows" without scanning everything.

Everything reads from the same _authority_; the database is an index over it.

## The data model matters more than the engine

The draft architecture asks "Change over time schema?". The proposal: **SCD Type 2** — one row
per entity-version with a validity interval. Not one row per entity per pass.

The volume argument is decisive. ~1,850 entities and ~200 real changes/day (measured on the
current pipeline) means a year of versions is ~75k rows. Storing every entity every pass would
be ~37M rows/year carrying the same information. Keyframe-and-delta is ~200× smaller — but SCD2
gets that compression _while staying directly queryable_, which a delta chain does not.

```sql
-- what we actually saw, and when. Small, append-only.
observations(captured_at, slug, variant, status, error)

-- entity versions
endpoint_versions(id, valid_from, valid_to, hash, last_observed_at, …columns)
model_versions(slug, valid_from, valid_to, hash, last_observed_at, …)
provider_versions(slug, valid_from, valid_to, hash, last_observed_at, …)

-- pricing: its own versioned child table, one row per SKU
endpoint_pricing(endpoint_id, sku, value, valid_from, valid_to)

-- telemetry: append-only, never versioned
endpoint_telemetry(endpoint_id, captured_at, …)
```

`valid_from` is the `captured_at` of the pass where the value was first seen; `valid_to` is the
`captured_at` where it changed or disappeared (exclusive, null = current). A content `hash` per
version makes ingest one comparison — hash differs, close the old row and insert a new one — and
makes re-running a pass a no-op.

Four things fall out of this shape.

### Validity and observation are different facts

⚠️ The single most important modeling decision, and the one the current system gets wrong
(`failedModelKeys`). `valid_to` says when a value stopped being true. `last_observed_at` says
when we last _confirmed_ it. "Current, confirmed 5 minutes ago" and "current, but nothing has
successfully looked in three days" are different states and the product should be able to say
which. That is why `observations` is a table of its own rather than a column.

An endpoint may only be closed out (`valid_to` set) when its scope was **successfully observed
and the endpoint was absent**. An unobserved or errored scope advances nothing.

### Changesets become a view, not a table

Monitor and Alerts read `WHERE valid_from = <captured_at>`. The change feed is derived from the
same rows the grid reads, which is what actually delivers "everything reads from the same
source". Materialize it for speed if needed — but it must never become a second authority.

### Pricing gets its own table

The draft asks "Separate Pricing?". Yes, on two pieces of evidence:

- Pricing is ~86% of change volume. If it lives in the endpoint row, every endpoint version is a
  pricing version and "did a capability change?" is buried in float drift.
- `pricing_json` is an open dictionary — 203 distinct SKU keys across 1,053 endpoints in pass
  `2026-07-25T04:15:49.584Z` (`bun run fields`). An open key set is a child table by nature.

Designate `pricing_json` as the stored truth with one row per `(endpoint_id, sku)`, and treat
`pricing` / `display_pricing` as separately versioned presentation blobs. This also kills the
mirror problem — one price change stops producing three or four change rows.

### Pricing history stops being a reconstruction

`SELECT … WHERE endpoint_id = ? ORDER BY valid_from`. The current 260 lines of reverse replay,
the 20,000-doc cap with silent truncation, and the forget-prices-on-create hack all disappear.

## Engine and consumers

One writer, many readers. The Engine ingests a pass (raw → era adapters → canonical → upsert
versions); everything downstream hangs off the version transitions that ingest produced.

- **Convex** receives a push of current rows plus the change batch. It stays a serving cache for
  reactivity — the frontend cannot subscribe to D1 and should not try.
- **Alerts / webhooks** consume the same changeset through Queues, never by re-diffing.
- **Labs** read Parquet off R2 with DuckDB, or query the database directly.
- **Time series** is its own lane off `endpoint_telemetry`.

⚠️ Be honest about the caveat: "everything reads from the same source" means one _authority_
with pushes to caches, not one physical read path.

## Engine choice, in order

1. **SQLite** — `bun:sqlite` locally now, D1 later, same schema and same ingest code. At this
   volume D1's 10 GB holds a decade and one pass is ~1–2k upserts. Starting local means the labs
   work proceeds today and the infrastructure decision defers at zero cost.
2. **Postgres (Neon)** if temporal correctness starts hurting — range types and exclusion
   constraints genuinely prevent overlapping validity intervals, which SQLite cannot enforce.
3. **Parquet / Iceberg** — the analytics lane, generated _from_ the store, never the store itself.

## 🔀 Alternatives considered

- **One row per entity per pass (append-only, no validity).** Simplest possible ingest, trivially
  idempotent, and "as of" is a `MAX(captured_at) <= t` query. Rejected on volume: ~37M rows/year
  for ~75k rows of information, and every consumer pays the deduplication cost on every read.
  ❓ Worth revisiting if SCD2 close-out logic turns out to be the buggy part — correctness beats
  compression, and this variant is much harder to get wrong.
- **Change log as the authority (event sourcing), state derived.** Attractive because the change
  feed is a product surface. Rejected because current-state reads then require replay, which is
  exactly today's pricing-history pain, and because a delta chain is undiagnosable when one link
  is wrong. Deltas are compression, not truth.
- **Artifacts only, no database.** Consumers read `canonical/v1/**` directly. Rejected: no point
  lookups, no as-of queries without a full scan. Kept as the durable form underneath.
- **Convex as the normalized store.** Rejected in `direction.md` and still rejected — no blob
  storage, no historical authority, and its value is reactivity, which is a serving concern.
- **R2 SQL / R2 Data Catalog (Iceberg).** Genuinely interesting for the append-only lane and
  Alchemy already exposes `R2.DataCatalog`. ❓ Immature for point reads; revisit when the
  analytics lane is real rather than hypothetical.
- **Durable Object per entity with SQLite.** Great write path and strong consistency per entity;
  awkward for any query that crosses entities, which is most of them.

## ❓ Open questions

- **Grain of a version.** Whole-entity (one row changes if any field changes) or per-field
  (`entity_id, field, value, valid_from`)? Whole-entity is simpler and matches how the grid
  reads; per-field makes "history of one field" trivial and noise-muting per field explicit.
  ⚠️ Per-field is EAV — it fights typed columns and SQL. Leaning whole-entity plus the separate
  pricing table, but this is the biggest unresolved modeling choice.
- **Where does noise muting live?** If sub-% `discount` drift is muted at ingest, the store never
  records it and the decision is unrevisable — which violates "prune at the diff point, not at
  ingestion". If it is muted at read time, every consumer must remember to. Candidate: store
  everything, and make the changeset _view_ the place where the (versioned) noise policy applies.
- **Does the store need to be bitemporal?** We have `valid_from` (when it was true upstream, as
  far as we can tell) and `captured_at` (when we saw it). These are the same clock today because
  our only knowledge of upstream time is our own observation. A back-catalogue replay might make
  them diverge. ❓ Probably not worth the complexity until it does.
- **Rebuild cost.** How long does replaying all passes into an empty store take, and is that
  bounded enough to keep calling the store disposable? Must be measured, not assumed — the whole
  framing depends on it.
- **Endpoint delete/recreate lineage.** SCD2 records it as death and birth. A `lineage_id` column
  filled by a separate heuristic pass can annotate later; does not block anything.
- **Does `pricing_version_id` change iff pricing changes?** First cross-pass diffs answer it. If
  yes, it is a cheap change-detection shortcut for the pricing child table.
- **Schema versioning of the store itself.** `canonical/v1/` versions the artifacts; the database
  needs its own version and a rebuild-on-bump rule. Same idea, needs stating.
- **Do models and providers even need SCD2?** They change far less than endpoints. Uniformity is
  probably worth more than the saving, but it is worth asking once churn is measured.

## Revisions to the draft architecture

- **Adapters** are pure `raw → raw'` functions keyed by era, running _before_ canonicalization.
  They belong in `packages/processes` next to canonicalize; the Worker only calls them. Nothing
  about them needs to be online.
- **Legacy Artifact Store** — getting the ~12–13k bundles into R2 verbatim is one job; running
  them through adapters is a second. Normalizing them is explicitly a non-goal of the first move,
  and it is the only remaining thing that could still reshape the canonical schema.

## Suggested order

1. Design the schema against real data — build it locally in SQLite over the mirrored passes.
   Every open question above becomes a query instead of an argument.
2. Measure churn from it (this replaces the standalone churn-report idea — the store answers it
   better, and answers the parked questions in [openrouter.md](openrouter.md) at the same time).
3. Only then wire the Engine. Ingest is easy once the schema is proven.
