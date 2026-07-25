# The Normalized Store

How canonical entities are stored, and how the Engine and consumers read them. This is the
"Normalized Store" box in dean's draft architecture, worked through into a plan for the
**production ingest process** — the next thing to build. Written 2026-07-25. The figures are
measured; the shapes are proposals.

Annotations: ❓ = open question, ⚠️ = landmine, 🔀 = alternative we considered.

The point of this document is the _reasoning_ — what kind of data this is, how to decide where a
field lives, and how we find out when that decision has gone stale. Column lists are deliberately
absent: they are the easy part, and writing them down here would freeze the one thing that has to
stay revisable.

## The property that makes the decision easy

The store is **derived**. Layer 0 artifacts are in R2 forever, canonicalization is deterministic
and versioned, so the store can be rebuilt from scratch at any time. It is a rebuildable index,
not a system of record.

That reframes the question. Not "which database do we commit to for five years" but "which is
easiest to rebuild into something else when we are wrong". Optimize for rebuildability and the
choice stops being frightening.

⚠️ This property is load-bearing for everything below, and it is currently an assumption.
Rebuild cost over the _whole_ back catalogue (~12–13k passes, not a 40-pass window) has to be
measured before we lean on the word "disposable". A rebuild measured in minutes means we can
reclassify a field whenever the data tells us to. A rebuild measured in hours means we won't, and
every decision below quietly becomes permanent.

So "how do we store it" has two answers, and we want both:

- **Durable form — versioned artifacts in R2.** `canonical/v1/<captured_at>/…`. Immutable, cheap,
  DuckDB-readable off R2 with range requests, and the input to any rebuild.
- **Queryable form — a SQL database, explicitly a cache.** Artifacts cannot answer "what did
  endpoint X look like on 2026-03-01" or "give me current rows" without scanning everything.

Everything reads from the same _authority_; the database is an index over it.

## What kind of data this is

Every decision downstream follows from five properties of this particular data class. They are
worth stating plainly, because the schema is only defensible relative to them.

1. **Small, with stable natural keys.** ~1,850 entities. Endpoint UUIDs, model slugs and provider
   slugs are stable identifiers; nothing needs surrogate keys.
2. **Sparse real change.** Most entities are unchanged in most passes. This is what makes
   versioning cheap and one-row-per-pass wasteful.
3. ⚠️ **Change is _not_ uniformly distributed across fields.** Within one entity, some fields
   never move and others move every pass. Treating an entity as one atom means the fast fields set
   the write rate for the slow ones.
4. ⚠️⚠️ **A field's churn character drifts, without warning.** Upstream's endpoint `status` used
   to change occasionally; it now flips `0 ↔ -2/-3/-5` on 25–50 endpoints _every pass_ (measured
   over 40 consecutive passes). Nothing announced that. Any design that classifies fields once and
   assumes the classification holds is already wrong; it just doesn't know yet.
5. **Open key sets and silent schema drift.** `pricing_json` carries ~203 distinct SKU names
   across ~1,050 endpoints, and the set grows. Upstream adds and removes fields without notice
   (`variable_pricings` quietly emptied; `preview_audio` appeared mid-week).

Properties 3 and 4 are the ones the earlier draft of this document under-weighted, and they are
the reason this revision exists. The store's job is not only to record change but to stay useful
when the _shape_ of the change moves.

## The model: SCD Type 2, at the right grain

The draft architecture asks "Change over time schema?". The answer is **SCD Type 2** — one row
per version with a validity interval, not one row per entity per pass.

The volume argument settles it. ~1,850 entities and a few hundred real changes a day means a year
of versions is on the order of 10⁵ rows. One row per entity per pass is ~10⁷ carrying the same
information, and every consumer pays deduplication on every read. Keyframe-and-delta is smaller
still but stops being directly queryable, which is the whole point of having a queryable form.

`valid_from` is the `captured_at` of the pass where the value was first seen; `valid_to` is the
`captured_at` where it changed or disappeared (exclusive, null = current).

### The grain question, answered: column groups by volatility

The previous draft left "whole-entity version or per-field version" as the biggest open modelling
choice, and leaned whole-entity. Property 4 breaks that lean. With whole-entity grain, one field
that starts flapping re-versions every stable field beside it — `status` alone would generate
roughly an order of magnitude more versions per year than the entire budget above, and every one
of those rows carries a full copy of ~30 columns that did not change.

Per-field versioning (`entity_id, field, value, valid_from`) fixes that and is EAV: it fights
typed columns, fights indexes, and makes the grid's read a pivot.

The resolution is neither. **Partition an entity's columns into groups by churn character, and
version each group independently against the same natural key.** We already invented this once —
pricing was too churny to live in the endpoint row, so it became a child table. That was not a
pricing-specific hack; it was the general move, applied once.

```sql
-- the lanes, not the columns
<entity>_versions          -- durable: identity, capability, limits, policy. SCD2.
<entity>_<dictionary>      -- open key sets: one row per (entity, key). SCD2.
<entity>_operational       -- volatile state: health, penalty, capacity. SCD2 or transitions.
<entity>_telemetry         -- samples. Append-only, never versioned.
observations               -- what we looked at and what answered. Append-only.
```

Three or four narrow tables per entity, each moving at its own rhythm. A field changing character
becomes a _move between groups_ — bounded, mechanical, and cheap if rebuild is cheap — rather than
a rethink of the model.

### How to decide which group a field belongs in

The process, applied per field, with the answer written down next to the field:

1. **Is this what the thing _is_, or how it's _doing_?** Identity, capability, limits and policy
   are facts about the offering. Health, load, penalty and availability are facts about this
   moment. Useful test: would a user comparing providers want to read this as a _value_ or look at
   it as a _chart_? Values go in the durable group; charts go to telemetry.
2. **How fast does it move relative to its siblings?** A field whose change rate is an order of
   magnitude above the group's does not belong in that group — it will dominate the group's write
   volume and bury its signal. Rough threshold: anything changing in more than ~10% of passes
   should be justified explicitly or moved.
3. **Is the key set closed?** A fixed, known set of names is columns. An open dictionary that
   grows without notice is a child table keyed by `(entity, key)`. ⚠️ Never a JSON blob you will
   later need to diff — that is how one price change becomes an unreadable text delta.

Two consequences worth stating, because they are easy to get wrong:

- **Mirror and presentation views are not entity columns.** Upstream ships the same price several
  ways (`pricing`, `display_pricing`) and an opaque `pricing_version_id`. Designate one as stored
  truth — `pricing_json`, the adapter SKU keys — and keep the rest out of the versioned entity
  row. They are labels attached to a pricing identity, not properties of an endpoint, and stored
  as endpoint columns they multiply one real change into three or four change rows. The current
  pipeline's "pricing is ~86% of change volume" figure is mostly this amplification plus sub-%
  `discount` float drift, not real price movement; with a single stored view, actual SKU movement
  is a small minority of change.
- `pricing_version_id` is a **superset** of price change, not an equivalent: across 39 pass
  transitions every SKU movement on a surviving endpoint came with a new id (none missed) and the
  id also changed three times with no movement at all. That makes it a usable cheap _detector_ and
  an unusable change _record_. ❓ Worth re-testing over a longer window before relying on it as a
  shortcut.

### Which lane a field is in is a versioned decision, not a schema fact

Because of property 4, the classification is data-dependent and will be wrong eventually. So it
needs the same treatment as everything else derived: a version, and a rebuild-on-bump rule. The
store's own schema version sits alongside `canonical/v1/`; changing a field's lane bumps it and
triggers a rebuild rather than an in-place migration. That is only tolerable if rebuild is cheap,
which is why the measurement above gates this whole approach.

## Validity is not observation

⚠️ The single most important modelling decision, and the one the current pipeline gets wrong
(`failedModelKeys`). `valid_to` says when a value stopped being true. Observation says when we
last _confirmed_ it. "Current, confirmed five minutes ago" and "current, but nothing has
successfully looked in three days" are different states and the product must be able to say which.

A version may only be closed out when its scope was **successfully observed and the entity was
absent**. Three refinements the earlier draft didn't carry:

- **Derive staleness; do not store it.** The draft put `last_observed_at` on every version row.
  Don't: it makes every pass rewrite every row to record that nothing happened, which is the
  dominant write cost and buys nothing that a join against `observations` doesn't give. With
  staleness derived, a pass in which nothing changed writes _only_ observations. "Don't sync
  state, derive it" happens to also be the performance answer here.
- **Grade the evidence.** Not every response is evidence of absence. A 200 is evidence. A 404 is
  evidence — it means "this scope has zero endpoints right now". A 5xx or a transport error is
  _not_ evidence and must advance nothing; it leaves the version open and stale. Conflating "we
  asked and it's gone" with "we couldn't ask" is precisely the bug being fixed.
- **Match the close-out scope to the evidence available.** An endpoint's evidence is its own
  request scope `(permaslug, variant)`, which the store knows from the row itself — so close-out
  is precise. Entities deduplicated across the whole pass (models, providers) have no per-scope
  evidence; their honest rule is the conservative one: close nothing unless every scope answered.
  ❓ Models could be scoped by permaslug with a little bookkeeping; worth doing only if
  conservative close-out proves too sticky in practice.

### Observations must be a Layer 1 artifact, not an ingest side-effect

This is a contract change and it blocks the production Engine. The canonical artifact currently
carries entities only. An Engine reading `canonical/v1/<captured_at>/` therefore _cannot_ grade
evidence — it can only choose between never closing anything and closing on bare absence, which
is the `failedModelKeys` bug again with extra steps.

Per-scope status and error must ship as a first-class canonical output alongside the entities.
While we're there: the catalog's "does this slug have endpoints right now" map is exactly the
evidence that separates "model withdrawn" from "model listed with zero endpoints", and it is
currently computed during canonicalization and thrown away. Ship it too.

## Volume and signal are two problems

These get conflated, and the existing principle only addresses one of them.

- **Volume** is how many rows a noisy field writes. It is fixable only at write time, by not
  versioning that field in that group.
- **Signal** is the change feed drowning in noise. It is fixable at read time, in the changeset
  view, where the policy is versioned and revisable.

"Prune at the diff point, not at ingestion" is the right answer to signal and does nothing for
volume. Both need handling, by different mechanisms.

### Route, don't prune

Moving a noisy field out of the versioned entity row looks like pruning at ingestion. It isn't —
as long as it lands somewhere at full fidelity. Append-only samples of `status` are _more_ data
than SCD2 versions of it, not less, and keeping every sample preserves the right to reclassify
later. The rule to hold onto is: **nothing gets discarded at ingest; things get routed.**

❓ Choose per field between every-sample and transitions-only in the append-only lane. Samples are
simpler and honest about cadence; transitions are far smaller for a field that sits at one value
for hours. Both are append-only, so neither carries close-out risk.

### Changesets stay a view

Monitor and Alerts read `WHERE valid_from = <captured_at>` across the groups. The change feed is
derived from the same rows the grid reads, which is what actually delivers "everything reads from
the same source", and it is the natural home for the noise policy. Materialize it for speed if
needed — it must never become a second authority.

Group partitioning helps here for free: with volatile fields in their own lane, a consumer that
wants capability changes can read the durable group's transitions and never see health flapping
at all.

### Pricing history stops being a reconstruction

`SELECT … WHERE endpoint_id = ? ORDER BY valid_from`. The current 260 lines of reverse replay, the
20,000-doc cap with silent truncation, and the forget-prices-on-create hack all disappear.

## The feedback loop

This is the part the earlier draft had no answer for, and it is the real response to "upstream
changes without warning".

The architecture is budgeted on a few hundred changes a day. Nothing in the system watches that
number. When `status` changed character, the way we found out was a manual investigation months
later. That is the gap — not a wrong classification, which is recoverable, but the absence of
anything that notices.

What the production process needs:

- **Per-field churn, recorded per pass, against a baseline.** Cheapest place to compute it is
  _after_ ingest, from the changeset view — ingest deliberately reads only the key and a content
  hash for its comparison, and widening that read to diff every column would spend exactly the
  write-path saving that derived staleness just earned. The view already does the field diff; a
  periodic job over it, or a windowed self-join on `previous.valid_to = current.valid_from`, gives
  the number.
- **An alarm on order-of-magnitude drift**, per field, not a fixed threshold. The signal is "this
  field's behaviour changed", and that is only meaningful relative to its own history.
- ⚠️ **Flag, don't refuse.** A pass producing 50× baseline versions is tempting to reject as
  corrupt. Don't: that discards data on precisely the day something interesting happened. Ingest
  everything and alarm loudly.
- **Churn output feeds the classification process above.** A field that trips the alarm gets
  re-run through the three questions and, usually, moved lanes. That loop is the adaptation
  mechanism; without it the lanes are just a snapshot of what was true when we wrote them.

This also replaces the standalone churn-report idea — the store answers it better, and answers the
parked field-classification questions in [openrouter.md](openrouter.md) at the same time.

## Ingest discipline

The invariants that make a one-writer SCD2 ingest safe. Worth listing because each one is cheap
to add up front and expensive to retrofit.

- **A content hash per version makes ingest one comparison** — hash differs, close the old row and
  insert a new one. ⚠️ The hash is a comparison key, not data: it must be computed over column
  _names_ and values, not positional order, or an incidental reordering (a formatter, a refactor)
  silently invalidates every hash in the store and forces a rebuild nobody asked for.
- **Idempotent by `(natural key, valid_from)` as the primary key.** Re-ingesting a pass converges
  on the same rows, which is what makes a partially-applied pass safe to simply re-run — worth
  having, because engines that batch writes will not give us one transaction per pass.
- **Forward-only.** Refuse a pass older than the newest ingested one rather than interleaving
  validity intervals. Backfill is a rebuild, not an insert.
- **Fail loudly on a second value at the same `captured_at`.** One pass produced one value per
  key; a second means the input changed under us, and closing a zero-length interval would corrupt
  history rather than record it.
- **Enforce one open version per key** with a partial unique index (`WHERE valid_to IS NULL`).
  ⚠️ That is the _only_ temporal constraint SQLite can express; general non-overlap needs
  Postgres exclusion constraints.

## Engine and consumers

One writer, many readers. The Engine ingests a pass (raw → era adapters → canonical → upsert
versions); everything downstream hangs off the version transitions that ingest produced.

- **Convex** receives a push of current rows plus the change batch. It stays a serving cache for
  reactivity — the frontend cannot subscribe to the store and should not try.
- **Alerts / webhooks** consume the same changeset through Queues, never by re-diffing.
- **Labs** read Parquet off R2 with DuckDB, or query the store directly.
- **Time series** is its own lane off the append-only tables.

⚠️ Be honest about the caveat: "everything reads from the same source" means one _authority_ with
pushes to caches, not one physical read path.

## Engine choice, in order

1. **SQLite.** D1 for the production process; `bun:sqlite` remains the option for local schema
   iteration over mirrored passes, against the same schema and the same ingest code. At this
   volume 10 GB holds a decade.
   ⚠️ Storage is not the binding constraint — statements per invocation is. Packing rows into
   multi-row inserts (D1 caps bound parameters at 100 per statement) puts a full-catalogue
   bootstrap in the high hundreds of statements against a 1,000-per-invocation ceiling. That
   couples **schema width to platform limit**: widening the durable group by a handful of columns
   can be what decides whether a rebuild has to become a chunked Workflow. Group partitioning
   helps here too — narrow groups pack more rows per statement.
2. **Postgres (Neon)** when temporal correctness starts hurting. Range types and exclusion
   constraints genuinely prevent overlapping validity intervals, which is exactly this workload.
   The trigger to watch for: the first interval bug a constraint would have caught. Ingest code is
   dialect-thin, so this is a swap rather than a project.
3. **Parquet / Iceberg** — the analytics lane, generated _from_ the store, never the store itself.

## 🔀 Alternatives considered

- **One row per entity per pass (append-only, no validity).** Simplest possible ingest, trivially
  idempotent, and "as of" is a `MAX(captured_at) <= t` query. Rejected on volume: ~10⁷ rows/year
  for ~10⁵ rows of information, and every consumer pays deduplication on every read.
  ❓ Worth revisiting if SCD2 close-out logic turns out to be the buggy part — correctness beats
  compression, and this variant is much harder to get wrong.
- **Per-field versioning (EAV).** The honest answer to volatile fields, and rejected in favour of
  column groups: it fights typed columns and SQL, and turns the grid's read into a pivot. Column
  groups get most of the benefit at none of that cost.
- **Change log as the authority (event sourcing), state derived.** Attractive because the change
  feed is a product surface. Rejected because current-state reads then require replay, which is
  exactly today's pricing-history pain, and because a delta chain is undiagnosable when one link is
  wrong. Deltas are compression, not truth.
- **Artifacts only, no database.** Consumers read `canonical/v1/**` directly. Rejected: no point
  lookups, no as-of queries without a full scan. Kept as the durable form underneath.
- **Convex as the normalized store.** Rejected in `direction.md` and still rejected — no blob
  storage, no historical authority, and its value is reactivity, which is a serving concern.
- **R2 SQL / R2 Data Catalog (Iceberg).** Genuinely interesting for the append-only lanes.
  ❓ Immature for point reads; revisit when the analytics lane is real rather than hypothetical.
- **Durable Object per entity with SQLite.** Great write path and strong consistency per entity;
  awkward for any query that crosses entities, which is most of them.

## ❓ Open questions

- **Rebuild cost over the full back catalogue.** The gating measurement. Everything above treats
  reclassification as routine, and that is only true if a full replay is minutes rather than hours.
- **What has upstream `status` become?** [openrouter.md](openrouter.md) records the theory that it
  is a manually-set routing penalty. A field flipping on 25–50 endpoints every fifteen minutes is
  not manually set — something upstream got automated. That changes what the field _is_: if it is
  now health-based auto-deranking, "OpenRouter is currently penalising this endpoint" is a
  candidate product signal on the telemetry lane, not merely noise to route away. Correlating it
  against `stats` / `status_heuristics_*` in the same passes should settle it.
- **Which other fields are mis-laned already?** `is_deranked`, `is_disabled`, `capacity_tpm` and
  `deprecation_date` are the obvious operational candidates; `default_order` and `updated_at` are
  the obvious model-level ones. The churn loop answers this properly, but a first pass by hand is
  worth doing before the schema is written rather than after.
- **Do models and providers need SCD2 at all?** Measured over 40 consecutive passes: models and
  providers produced _zero_ versions beyond their birth. Not one field moved. The saving from
  special-casing them is therefore real but tiny, and uniform ingest code across every group is
  worth more — keep SCD2 everywhere. ❓ Re-check over a window long enough to contain a model
  launch, which is when they actually move.
- **Where does noise muting live, exactly?** Store everything, and make the changeset view the
  place the versioned noise policy applies. The remaining question is whether that policy is
  per-field configuration or code, and how it is versioned alongside the store's schema version.
- **Does the store need to be bitemporal?** We have `valid_from` (when it was true upstream, as far
  as we can tell) and `captured_at` (when we saw it). Same clock today, because our only knowledge
  of upstream time is our own observation. A back-catalogue replay might make them diverge.
  ❓ Probably not worth the complexity until it does.
- **Endpoint delete/recreate lineage.** SCD2 records it as death and birth. A `lineage_id` filled
  by a separate heuristic pass can annotate later; does not block anything.

## Revisions to the draft architecture

- **Adapters** are pure `raw → raw'` functions keyed by era, running _before_ canonicalization.
  They belong in `packages/processes` next to canonicalize; the Worker only calls them. Nothing
  about them needs to be online.
- **Layer 1's artifact contract grows an observations output** (above). Without it the Engine
  cannot grade evidence, and close-out correctness is the store's whole reason to exist.
- **Legacy Artifact Store** — getting the ~12–13k bundles into R2 verbatim is one job; running them
  through adapters is a second. Normalizing them is explicitly a non-goal of the first move, and it
  is the only remaining thing that could still reshape the canonical schema.

## Suggested order

1. **Fix the Layer 1 contract.** Ship per-scope observations and the catalog has-endpoints map as
   canonical outputs. Everything else is blocked on this, and it is small.
2. **Classify the field set into lanes by hand**, recording the answer to the three questions
   beside each field. Expect to be wrong about some of them; the point is that the reasoning is
   written down where the next revision can argue with it.
3. **Build ingest with its invariants and its churn instrumentation together.** The measurement is
   not a follow-up — it is the component that keeps step 2 honest, and retrofitting it means
   choosing between a wide ingest read and a second pass over the data.
4. **Measure full back-catalogue rebuild.** This either confirms the disposability the whole design
   rests on, or tells us the lanes are effectively permanent and need more care up front.
5. **Then wire consumers** — Convex push, alerts, the analytics export. Ingest being correct is the
   hard part; readers are cheap once the transitions are trustworthy.
