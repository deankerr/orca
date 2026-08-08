# Current-view slice (endpoints data grid)

Direction for the first production cut of the new architecture. Not a schema spec and not an
implementation checklist — a shared target so processing steps stop being rebuilt.

Related: `notes/objectives.md`, `notes/now.md`, engine capture, labs product-db experiments (general
direction only), product field selection (`packages/schema` product / orca-legacy /
product-to-legacy).

Vocabulary for module design (depth, seam, adapter, interface) follows the project’s deep-module
language: a **module** is anything with an interface and an implementation; **depth** is leverage at
a small interface; a **seam** is where that interface lives; an **adapter** satisfies it.

## Why this slice

The first product surface is the **endpoints data grid current view**: latest selected model and
endpoint state for browsing and filtering. It does not need history, change journals, or monitor
semantics.

The cut should run **alongside** the legacy system and be revertible by switching product reads
back. Monitor, alerts, and pricing history stay on the legacy path until a later slice.

## Philosophy

### Capture remains authoritative

Engine capture → object archive stays the immutable observation store. Worker current state and
Convex current-view rows are **disposable projections / caches**. They can be rebuilt from the
archive; the archive is never derived from them.

### Prefer partial freshness over global stall

Intermittent failure is corrected by a later observation of the same element, or is isolated to one
model / endpoint:

- A failed product delivery must not block raw capture.
- A failed update for one model must not block other models.
- Some stale product rows are better than the entire catalog going stale.

### Per-scope, not complete-crawl

Capture already observes **one model-variant’s endpoints response at a time**. Current-view work
uses that unit. There is no “all models ready” barrier before applying state.

**Unavailability** (for this slice) means: within a **successful** observation of a given scope,
endpoints that were previously current for that scope and are absent from the new result may be
marked unavailable for delivery. Settled fetch errors and cache disagreement are **not** treated as
deletion of prior state.

### No history in this slice

No change journals, pricing revisions, or monitor events. Prior state exists only so we can answer:
**did product-relevant current state change?** That prior is the previous **current** cache value,
not a historical log.

### Always refresh the worker cache; detect change for delivery

Routine happy path should not dig through the object archive. A worker-side **current cache** holds
the latest observation-shaped state and is **written on every successful observation**, like a
cache.

Before that write, the previous copy is loaded and passed — with the new observation — into pure
processing that decides whether product delivery should run. Delivery (e.g. Convex) is a separate
concern from cache refresh.

Efficiency tricks (content hashes, skip-parse paths) optimize equality inside the pure core. They
must not leak into delivery interfaces or force a particular store layout.

## Conceptual flow

```text
queue work unit (one model-variant in a crawl)
        │
        ├─ fetch OpenRouter endpoints
        ├─ store raw observation (archive)     ← must succeed independently
        │
        └─ current-view path (best-effort / isolated)
              parse → ScopeObservation (ids + bodies)
              prior ← CurrentCache.get(scope)
              plan  ← planTransition(prior, next)     ← pure; storage-agnostic
              CurrentCache.put(next)                  ← always
              if plan needs product delivery:
                 CurrentDelivery.apply(plan)          ← Convex, etc.
```

Prefer updating on the same queue path that already has the response. A sweep cron over the archive
is possible but usually worse for **current** freshness.

Order matters: **load prior → plan → write cache → deliver**. Compare uses the pre-write prior.

## Domain values (not modules)

Names for the data that crosses seams. Exact TypeScript shapes can evolve; the roles should not.

**Scope key**  
Identity of one model-variant observation unit (e.g. permaslug + variant, or stable product model
slug). The unit of cache get/put and of one queue message’s product work.

**Endpoint id**  
Stable upstream endpoint identity. Parsed out of each endpoint object so the cache and the plan can
key rows and detect add/remove within a scope.

**Scope observation**  
One successful endpoints result for a scope: enough structure to list endpoint ids and retain each
endpoint’s payload (and any scope-level model payload we choose to keep). Not a grid document and
not a full product projection — observation-adjacent, identity-validated.

**Compare view**  
The value `planTransition` actually diffs. Derived from a scope observation (or from one endpoint)
by selecting product-relevant fields and applying ignore policy (e.g. drop or neutralize stats).
Callers pass before/after compare views (or null for absent); they do not pass store rows or HTTP
bodies into the planner.

**Transition plan**  
Pure result of comparing prior and next for one scope: which models/endpoints to upsert for
product, which endpoint ids became unavailable, and what is a no-op for delivery. Not an event log
and not a cache write instruction (cache always takes the full next observation).

## Modules

Each module below is described by its **interface** (what callers must know) and what the
**implementation** is allowed to hide. Prefer **deep** modules: small interfaces, behaviour and
policy concentrated behind them.

### 1. `ScopeObservation`

**Responsibility:** Turn one endpoints API success body into a structured scope observation, or
reject it as unusable for current-view.

**Interface (sketch):**

- Input: raw JSON (archive document or live response body).
- Output: scope observation with scope key material + list of `{ endpointId, payload }`, or failure /
  empty.
- Invariant: every retained endpoint has a parsed **id**. Validation is **loose on product fields**
  but **strict enough for identity** — the same identity rules we already treat as stable for
  endpoints (string id present; enough adjacent fields to trust the object is an endpoint row, not
  arbitrary JSON). Full product/legacy shaping is out of scope here.
- Does not know R2 keys, D1, Convex, or change detection.

**Depth:** Hides envelope quirks (`data` vs error), per-row skip rules, and “how much schema is
enough.” Callers only learn: observation or not.

**Policy note:** Product eligibility (e.g. text-output-only) may live here as a named filter on the
observation, or as a later step before compare-view derivation. Either way it is pure and named — not
implicit in SQL or Convex.

---

### 2. `CurrentCache`

**Responsibility:** Worker-side **latest** observation per scope. Hot path for prior state so the
happy path does not scan the object archive.

**Interface (sketch):**

- `get(scopeKey) → ScopeObservation | null`
- `put(scopeKey, observation) → void` (always replace latest for that key)
- Optional later: metadata clocks (`observedBatch`, `updatedAt`) without changing the core get/put
  meaning.

**Invariants:**

- `put` is the routine update after every successful observation used for current-view — not gated on
  “product changed.”
- `get` returns what `put` last stored for that key (or null). No history API.

**Adapters:** e.g. D1, in-memory for tests. The interface does not mention SQL or JSON columns.

**Depth:** Hides layout (one row per scope vs per endpoint), serialization, and batching. Callers
only learn get/put by scope key.

**Not responsible for:** change detection, Convex, archive keys, equality, hashes.

---

### 3. `CompareView`

**Responsibility:** Derive the value used for product-relevant equality and planning from a scope
observation (or build one endpoint’s compare view from its payload).

**Interface (sketch):**

- `fromObservation(observation) → CompareView` (scope-level: model card + endpoint compare cards
  keyed by id), or per-endpoint helpers if the planner prefers that grain.
- Hides field selection aligned with official product selection, null/absent normalization, and
  **ignore policy** (stats and other high-churn / non-product fields are not part of equality).

**Depth:** This is where “what is an endpoint for product purposes?” concentrates. Changing ignore
lists or selected fields should not require edits to cache or Convex adapters.

**Relation to schemas:** Prefer aligning compare-view field selection with `product`-family shapes
so we do not invent a third product vocabulary. Compare view may be slightly narrower than full
product (clocks, delivery-only fields omitted).

---

### 4. `planTransition` (pure current planner)

**Responsibility:** The reusable core. Given prior and next for one scope, produce a **transition
plan** for product delivery.

**Interface (sketch):**

- `planTransition(prior: CompareView | null, next: CompareView) → TransitionPlan`
- Or equivalent grain: plan over endpoint maps + optional model card.
- Knows: baseline vs available vs unavailable vs updated (for delivery intent), using endpoint ids
  and compare-view equality.
- Does **not** know: where prior/next were stored, R2, D1, Convex, queues, crawl ids (except if a
  clock is explicitly part of the compare view — prefer not).

**Invariants:**

- Pure: same inputs → same plan; no I/O.
- Absent prior + present next → first-seen / baseline-style delivery intent.
- Present prior + present next → upsert only what product-equal considers changed; ids only in next
  that were missing → available; ids only in prior → unavailable **when next is a complete
  successful scope observation**.
- Fetch errors never become “next empty scope” at this layer — orchestration simply does not call
  the planner with a fake empty next.

**Depth:** Hides equality details (deep equal vs later hash of normalized compare view), ordering of
ops in the plan, and lifecycle labeling. Callers only learn: prior, next → plan.

**Internal seam (optional):** `equal(a, b)` / `normalize(card)` so hashing can replace deep equal
without changing `planTransition`’s interface. That is an implementation upgrade, not a new product
module.

**Test surface:** The interface _is_ the test surface — tables of prior/next observations (or compare
views) and expected plans. No database.

---

### 5. `CurrentDelivery`

**Responsibility:** Apply a transition plan to the product current-view surface the web app reads
(Convex or successor).

**Interface (sketch):**

- `apply(plan) → void` (or structured result / errors)
- May accept already-projected product documents if the plan carries them, or project from compare
  views / observation payloads inside the adapter — but **detection already happened**; this module
  does not re-decide “changed?”

**Adapters:** Convex mutations (primary for this slice), fakes for tests.

**Depth:** Hides auth, batching, table names, and document shape. Orchestration only knows apply(plan).

**Not responsible for:** reading prior from Convex for detection, archive access, ignore policy.

---

### 6. `ProductPresentment` (optional, thin)

**Responsibility:** Map product (or compare/delivery documents) into the shape the data grid
already expects (e.g. orca-legacy nested endpoints), if Convex storage is not already grid-native.

**Interface:** decode/project only; no I/O. Existing product → orca-legacy direction is the example.

**Depth:** Hides rename/nest rules. May live in the schema package rather than the engine.

If Convex stores grid-native docs, this collapses into the delivery adapter’s write path and need
not be a free-standing module.

---

### 7. Orchestration (worker path) — deliberately shallow

**Responsibility:** Wire capture success to cache + plan + delivery for one queue message.

**Interface:** not a deep library API — the queue consumer effect / function.

**Must:**

1. Archive write remains independent and primary.
2. On usable success: parse → get prior → plan → put cache → maybe deliver.
3. Isolate failures: delivery errors do not fail archive; prefer not to fail cache put because of
   delivery; one scope’s failure does not stop others.
4. Never invent “empty next” from transport/settled errors.

This layer is allowed to be shallow: depth lives in `planTransition`, `ScopeObservation`, and the
cache/delivery adapters.

## Seams that matter

```text
                    pure
         ┌──────────────────────────┐
         │  ScopeObservation        │
         │  CompareView             │
         │  planTransition          │
         │  ProductPresentment      │
         └────────────▲─────────────┘
                      │ before/after + plan only
         ┌────────────┴─────────────┐
         │  orchestration (worker)  │
         └───┬──────────────────┬───┘
             │                  │
             ▼                  ▼
      CurrentCache         CurrentDelivery
      (e.g. D1 adapter)    (e.g. Convex adapter)
             │
             ▼
      object archive (existing capture)
```

- **Two adapters justify a seam:** e.g. D1 + in-memory for `CurrentCache`; Convex + fake for
  `CurrentDelivery`. Do not invent ports with a single production adapter “for purity.”
- **Pure modules are in-process dependencies** — no ports; test through their interfaces directly.
- Bundle/archive materializers that understand old snapshot envelopes are **source adapters into
  `ScopeObservation` or CompareView**, not a second planner.

## What lives where

| Concern                                 | Where                                        |
| --------------------------------------- | -------------------------------------------- |
| Immutable evidence                      | Object archive (existing engine capture)     |
| Latest observation for happy-path prior | `CurrentCache` (worker-side)                 |
| Product-relevant change decision        | `planTransition` (+ CompareView / equal)     |
| Reactive UI current view                | Convex (or successor) via `CurrentDelivery`  |
| Grid field renames / nesting            | `ProductPresentment` or delivery write shape |
| History / monitor / alerts              | Legacy path (out of slice)                   |

Cache contents should stay **observation-adjacent** (identity-validated endpoints), not a second
copy of a heavily presented grid document. Presentation is for delivery and UI, not for the worker
prior.

## What this slice deliberately omits

- History journals, reversible changesets, monitor events, alert broadcast
- Pricing history charts
- Full-catalog atomic crawl barriers for product state
- Content-hash as a public interface (allowed later inside equality only)
- Shutting down legacy snapshots
- Making Convex the prior store for detection

## Open questions

Decide as we implement; pure modules can start without all answers.

1. **Cache grain** — one cache record per scope (whole `data` list) vs per endpoint id (with scope
   key). Scope grain matches the queue unit; endpoint grain can simplify partial updates later.
2. **How much schema on parse** — minimal identity struct vs sharing product endpoint field names
   while still ignoring unknown keys. Goal: parse ids reliably; avoid freezing presentation.
3. **Text-only (or other) eligibility** — on observation parse vs when building compare view vs only
   at delivery. Prefer one named policy function.
4. **Stats and high-churn fields** — fixed ignore list inside CompareView/equal (recommended default
   for “changed?”). Delivery may still refresh stats when other fields change, or always push stats
   on a looser rule — product decision, not cache decision.
5. **Convex document shape** — product-flat vs grid-nested; parallel tables vs flag on existing
   reads.
6. **Package home** for pure modules — schema package, small dedicated package, or engine-local
   until a second caller exists. Prefer not coupling the core to “bundles.”
7. **Initial fill** — natural crawl only vs one-shot backfill from archive.
8. **Catalog-driven model absence** — separate pass when a model leaves the catalog, or defer until
   successful empty/partial scope handling is enough.
9. **Auth / batching** for worker → Convex.
10. **Provider entities** — endpoint-embedded provider enough for the grid, or separate current
    provider rows.

## Success criteria

- Raw capture continues regardless of current-view path health.
- Worker cache always reflects the latest successful observation it processed for a scope (when the
  cache path runs).
- `planTransition` (and observation/compare pure helpers) are importable and testable without
  Cloudflare or Convex.
- Product delivery runs only from a plan, not from “always push” or from ad hoc field compares in the
  worker.
- Data grid can read a parallel Convex current view for the existing product scope and remain
  revertible to legacy views.
- Legacy snapshots + monitor remain the source of truth for history/alerts until a later slice.

## Non-goals for this note

Prescribing DDL, concrete Effect Schema field lists, package directory trees, or hash algorithms.
Those follow once the module interfaces above exist as code with tests against real endpoints
observations.
