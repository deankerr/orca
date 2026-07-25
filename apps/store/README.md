# @orca/store

Prototype of the **normalized store** from
[notes/data-architecture/normalized-store.md](../../notes/data-architecture/normalized-store.md):
canonical entities held as SCD Type 2 versions, so "what did this endpoint look like on
2026-03-01" and "what changed in this pass" are both plain SQL.

It runs as a Cloudflare Worker over D1 rather than local `bun:sqlite`, so the ingest code, the
schema and the query surface are the ones that will actually ship — the platform is not
simulated. `alchemy dev` runs the Worker locally in `workerd` against the dev-stage D1 database.

**This is a prototype to answer schema questions with queries instead of arguments.** The
schema is deliberately a simplified projection of the canonical entities (~29 endpoint columns,
not the full set), the input plumbing is a laptop pushing passes over HTTP, and nothing here is
load-bearing for the existing pipeline.

## The model

```sql
observations(captured_at, slug, permaslug, variant, status, error)   -- evidence, append-only
model_versions(slug,        valid_from, valid_to, hash, …)
provider_versions(slug,     valid_from, valid_to, hash, …)
endpoint_versions(id,       valid_from, valid_to, hash, …)
endpoint_pricing(endpoint_id, sku, valid_from, valid_to, hash, value)
passes(captured_at, ingested_at, scopes, observed, errored, transitions)
```

`valid_from` is the `captured_at` of the pass where the value was first seen; `valid_to` is the
`captured_at` where it changed or disappeared (exclusive, NULL = current). A content hash per
version makes ingest one comparison, and `PRIMARY KEY (key, valid_from)` makes re-ingesting a
pass converge on the same rows.

Three decisions differ from the note, and each is explained where it is made:

- **There is no `last_observed_at` column.** Validity and observation are different facts, and
  observation is already recorded in `observations`. Staleness is _derived_ by joining an
  endpoint's scope `(model_variant_permaslug, variant)` against the observation table — so an
  unchanged pass writes ~430 observation rows and touches no version row at all.
- **A close-out requires observed absence, and a 5xx is not an observation.** 200 and 404 are
  both answers (404 = "this scope has zero endpoints right now"); a 5xx or a transport error
  advances nothing and leaves the version open and counted stale. This is the modelled version
  of the current pipeline's `failedModelKeys` workaround.
- **Models and providers close out conservatively.** They are deduplicated across the whole
  pass, so their evidence is the whole pass: nothing closes unless every scope answered.
  Endpoints get the precise per-scope treatment, because that is where absence is a fact about
  one provider's offering.

## Running it

```bash
bun run --cwd apps/capture mirror --passes 40
```

```bash
bun run dev
```

```bash
bun run load
```

`dev` provisions the dev-stage D1 database, applies `migrations/`, and serves the Worker on
`http://localhost:1338`. `load` reads the mirrored Layer 0 passes, runs them through the real
Layer 1 canonicalizers (`@orca/processes`), and POSTs each pass in `captured_at` order. Both are
idempotent; re-loading a pass that is already the newest is a no-op.

## Reading it

- `POST /ingest` — one canonicalized pass; returns the version transitions it produced
- `GET /passes` — ingested passes, newest first, with their transition summaries
- `GET /changes/<captured_at>` — the changeset **view**: created / deleted / updated per entity,
  with per-field before/after. Monitor and Alerts would read this; nothing re-diffs anything.
- `GET /current/endpoints` — current rows plus derived staleness
- `GET /endpoints/<id>` — full version history of one endpoint
- `GET /endpoints/<id>/pricing` — price history, one ordered SELECT per SKU
- `GET /stats` — row counts and measured compression

## What it measured

Over 40 passes (2026-07-24T21:45 → 2026-07-25T07:30, 15-minute cadence, 433 scopes,
1,054 endpoints, 423 models, 101 providers):

| Question the note parked                              | What the store says                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rebuild cost                                          | 85–92 s for the whole 10-hour window, and repeated rebuilds reproduced every row count exactly. Cheap enough to keep calling the store disposable      |
| Cost of a bootstrap pass                              | 737 SQL statements, ~5.6 s — inside D1's 1,000-queries-per-invocation ceiling, so ingest needs no workflow chunking yet (but only ~25% headroom)       |
| Cost of a steady-state pass                           | 56–114 statements, ~1.6–2.2 s. Most of that is the ~430 observation rows; the version tables are barely touched                                        |
| Total volume                                          | 7,176 versions across 40 passes, against 227,240 rows for one-row-per-entity-per-pass — 31.7× at this window, and the ratio grows linearly with passes |
| Do models and providers need SCD2?                    | 423 models and 101 providers produced **zero** versions beyond their birth in 10 hours. The saving is tiny; uniform ingest code is worth more          |
| Does `pricing_version_id` change iff pricing changes? | Not _iff_ — a **superset**. All 10 price movements on surviving endpoints came with a new id (0 missed), but it also changed 3× with no price movement |
| Where does endpoint churn actually come from?         | ⚠️ `status`, the routing penalty — 1,447 of 1,461 endpoint versions. See below                                                                         |

The last one is the finding worth acting on. The note expected pricing to be ~86% of change
volume; here it is a small minority (30 SKU-value changes and 13 `pricing_version_id` changes),
because two of the current pipeline's amplifiers are gone by construction: `pricing_json` is the
only stored price view, so one price change is one change; and `discount`, ~60% of today's change
rows, lives in the `pricing` view this store doesn't keep.

What is left is dominated by upstream's `status` — a manually-set routing penalty that flips
0 ↔ -2/-3/-5 on 25–50 endpoints **every pass**. Stored as an entity column it is ~1.6M
versions/year on its own and swamps the ~75k/year the note budgeted for. It is telemetry wearing
an entity field's clothes, and belongs in the telemetry lane with `stats` and
`status_heuristics_*` rather than being muted at the diff point. It is deliberately still stored
here (as `or_status`) so the measurement stays visible.

Two behaviours were verified against real data rather than argued about:

- **A real death and a real birth, both cascaded correctly.** `z-ai/glm-5.1 @ baseten/fp4` was
  withdrawn at 00:30 and closed out at that pass, taking its three pricing rows with it; a
  different endpoint appeared at 06:00 with three of its own. Each is one line in
  `/changes/<captured_at>`.
- **Stale ≠ dead.** Feeding the same missing endpoint twice — once with its scope errored, once
  with its scope answering 200 — leaves it open and `stale: true` the first time (with
  `last_observed_at` still pointing at its last real confirmation) and closes it the second.
  This is the property the whole model hangs on.

## Known prototype limitations

- **Ingest is not atomic across the whole pass.** D1 caps bound parameters at 100 per statement,
  so rows are packed into multi-row inserts and sent in batches; each batch is a transaction, the
  pass is not. Re-ingesting the same pass converges, which is what makes that acceptable here and
  is one of the reasons the note lists Postgres as step 2.
- **Passes must be ingested in order.** An older `captured_at` is refused with a 409 rather than
  interleaved into existing validity intervals. Backfill would need a rebuild, not an insert.
- **One open version per key is enforced; overlapping intervals in general are not.** A partial
  unique index (`WHERE valid_to IS NULL`) is the only temporal constraint SQLite can express.
- **The store owns no schema versioning yet.** `migrations/` is additive only; a shape change
  means dropping and re-loading, which is the intended posture for a derived index. ⚠️ Changing
  the projections in `src/pass.ts` changes every hash, so it is a rebuild, not a migration — and
  the store notices, because the ingest guard refuses to write a second version at a
  `captured_at` that already has one. (This bit us once: the repo's formatter re-sorted a
  projection literal, which changed the hash input. Hashing by sorted column name rather than
  insertion order fixed the sensitivity; the guard is what made it visible.)

## Operating

Managed with Alchemy — see [apps/capture/CLAUDE.md](../capture/CLAUDE.md) for stages, auth,
commands and the Effect/Alchemy gotchas; this app follows the same conventions.
`bun run destroy` removes the dev-stage database and Worker.
