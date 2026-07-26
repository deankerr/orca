# The Artifact Pool

**Status: proposal.** It revises stated positions in [direction.md](direction.md) and invalidates
schema decisions already made in `packages/schema/src/lanes.ts` — those contradictions are listed
explicitly at the end rather than edited away.

The premise: cadence is a **dial**, adjustable at any time for any reason, per producer and per
consumer. Freshness becomes a matter of taste rather than a property of the architecture. Everything
below is what has to be true for that to hold.

Annotations: 📌 = measured, ⚠️ = landmine, ❓ = open question.

## 1. Why the pass has to go

📌 The uniform sweep is almost entirely redundant. With telemetry (`stats`, `status*`) and the
embedded `model` / `provider_info` copies stripped, across 39 transitions:

|                                            |                                 |
| ------------------------------------------ | ------------------------------- |
| scope-observations carrying any change     | **841 / 16,887 = 5.0%**         |
| scopes that moved at all in 10h            | **75 of 433** — 358 never moved |
| top mover (`z-ai/glm-5.2`)                 | **38 of 39** transitions        |
| raw bodies byte-identical to previous pass | 13.4%                           |

⚠️ That last row kills the obvious storage fix: raw bodies barely dedupe, because embedded telemetry
churns on every fetch. Content-addressing the raw layer would recover 13%. The only way to not store
the noise is to not fetch it.

📌 The catalog is the right discovery instrument and nothing more. Telemetry-stripped, **27 of 39
transitions were byte-identical** over the endpoint-bearing models (26 of 39 over all 807 entries),
and when it moved, 1–5 models moved. But tested as a change detector for endpoint scopes:

```
caught 27 · missed 814 · false alarms 427   →  recall 3.2%
```

⚠️ It carries only the _top_ endpoint, so it is blind to 97% of endpoint change. ⚠️ And the 427 false
alarms are their own warning: the catalog and `stats/endpoint` are **independently cached**, so they
disagree about the same endpoint. A catalog-embedded endpoint is never a substitute for an
observation of one.

So: the catalog answers _what exists_, at ~5-minute resolution, for one request. Everything else has
to be scheduled per scope — which means passes stop being aligned, which means the pass stops
existing.

## 2. The time model — the load-bearing change

**There is exactly one time axis, it is ours, and it is `observed_at`: the moment we made the
request.**

We never observe events. Upstream is cached, so what we are handed was generated at some earlier
moment we cannot know, and the same bytes can be served to us more than once. No cadence changes
this. The only defensible claim is therefore an interval, bounded by our own requests:

> A change occurred somewhere in `(previous observed_at, this observed_at]`.

⚠️ This interval is **conservative on purpose**. Upstream staleness only ever makes the true moment
_earlier_ than our lower bound suggests, never later, so a claim stated this way is never wrong — it
is only imprecise, by an amount we do not pretend to know. Narrowing it would mean claiming
precision we cannot defend.

### ⛔ Rejected: deriving a generation time from response headers

`date - age` looks like it recovers when upstream actually produced the data, and an earlier draft of
this note built the time axis on it. **It cannot be part of the system.**

- ⚠️ **It couples the time axis to infrastructure we do not control.** Cache TTLs, header semantics,
  even which CDN sits in front of OR are all theirs to change without notice. That is a second class
  of upstream drift on top of the schema drift era adapters already exist to absorb — and unlike a
  field appearing, it would silently corrupt the axis every other fact hangs off.
- ⚠️ **It is absent from the archives.** Headers have been captured since 2026-07-26; the back
  catalogue is 1+ year. A time model that only works for the newest weeks needs an era adapter _for
  time itself_, which is the worst possible place to need one.
- ⚠️ It was never complete anyway: `cf-cache-status: HIT` sends no `age`, so ~15% of observations
  could not be placed even in principle.

📌 The header findings stay in [openrouter.md](openrouter.md) as **recorded context** — they are why
we know sub-5-minute polling is wasted, and why "unchanged" is not evidence the world stood still.
Context informs where we set the dial. It never becomes a column, a key, or an input to any derived
layer. Layer 0 keeps storing whatever the response carried, because Layer 0 stores everything
verbatim and interprets nothing; no layer above may read it.

⚠️ **What this still changes in the store.** `valid_from` today is the `captured_at` of the _pass_
that first saw a value (`lanes.ts:42`). It becomes the `observed_at` of the _observation_ that first
saw it. Smaller than the earlier draft claimed, but not cosmetic: it moves the axis from a
pass-aligned clock to a per-scope one, which is what makes independent scheduling expressible at all.

📌 Once the dial moves freely, **no consumer may assume a regular grid** — no "previous pass", no
aligned observation set, no interval arithmetic. This is already true of the 1+ year of existing
archives, whose cadence varies; the current schema simply doesn't admit it. Making it the only case
is what makes the dial free: no code path can depend on cadence, because none can observe it.

## 3. What "big data" means here — and what to skip

What is wanted from the lakehouse world is the _practices_ — columnar storage, schema-on-read,
immutable append-only, compute decoupled from storage — not the scale machinery. Anything justified
by terabytes is ceremony we pay for and get nothing from.

The real cost is **accessibility, denominated in object count and scan shape, not GB.** This rules
out the naive fix of one object per observation: at a reduced cadence that is still ~18M objects over
five years, buying cheap point lookups at the price of never scanning the corpus again. ⚠️ Layer 0
must stay batched and append-shaped. Per-scope access is what the normalized store and the analytics
lane exist to provide — don't contort the unrecoverable layer to serve a query pattern a derived
layer owns.

## 4. Schema resilience: two layers, two different answers

**Layer 0 is immune because it has no schema.** Not a permissive schema — none. One row per
observation:

```
{ slug, permaslug, variant, observed_at, status, headers, body: <opaque json> }
```

Ingestion never looks inside `body`, so an upstream field addition, rename, restructure or type
change cannot break it. This is the standard landing-zone pattern and it is the correct reading of
"we are humble observers of data".

⚠️ `headers` is stored for the same reason `body` is — Layer 0 keeps what it was handed — and is
**opaque to every layer above**, per §2. `observed_at` is the only time any consumer may read, and
the only one the archives can supply.

**Layer 1+ is where structure appears, and where evolution is a real question.** Apache Iceberg is
the industry answer: columns tracked by **ID rather than name**, so add / drop / rename / reorder /
widen are metadata-only operations and existing files keep reading; plus ACID commits, snapshot
isolation, time travel, partition evolution and predicate pushdown.

📌 **But we probably don't need Iceberg's schema evolution.** In-place evolution exists for people who
_cannot re-derive_ their tables. We can — `canonical/<version>/` re-run from raw is already the
strategy, and it is strictly more powerful, since it can restructure retroactively rather than only
append columns. Take Iceberg for the query side; keep re-derivation as the schema-change mechanism.
Adopting evolution ceremony for a problem already solved better is how this gets heavy.

## 5. The platform pieces

Checked against Cloudflare's docs 2026-07-26, not recalled.

- **Pipelines** (open beta, Workers Paid) — durable buffered **streams** via HTTP endpoint or Worker
  binding, SQL transforms in flight, exactly-once delivery, **sinks** writing Iceberg tables to R2
  Data Catalog or Parquet/JSON to R2, configurable roll interval. 📌 A stream field may be typed
  `json`, so a raw stream commits to no schema at all.
- **R2 Data Catalog** — managed Iceberg REST catalog on the bucket, including **managed compaction
  and snapshot expiration**. This matters more than it sounds: small-file accumulation is the
  standard way a lakehouse rots.
- **R2 SQL** — serverless queries with aggregations, `GROUP BY`, `HAVING`. DuckDB, Spark, PyIceberg
  and Snowflake connect through the same catalog.

📌 This deletes the batching problem outright. `CHUNK_SIZE = 40` in `capture-workflow.ts` exists
because of Workflow subrequest budgets and the ~1 MiB checkpoint clone, and
`observations/<part>.jsonl.gz` is that constant fossilised into the key layout. Under a stream the
Worker emits one record per observation and stops caring about file layout entirely — the constant
has no successor.

⚠️ Correction to a claim in `apps/capture/README.md`: this does **not** remove the hand-made-token
problem. Sinks take a `--catalog-token` created in the dashboard. It makes that token worth creating
once, rather than something to avoid.

## 6. The pool protocol

Producers append. Each consumer holds its **own cursor** over the pool and reads everything past it
at whatever cadence it likes. That is the entire coordination mechanism, and it is what gives every
entity an independent dial without negotiating with any other entity.

- A new consumer starts at cursor zero and backfills for free.
- Reprocessing is a cursor reset.
- Iceberg provides this natively via snapshot IDs — incremental reads are a feature, not something
  to hand-roll.

Sketch of the actors, each with its own dial:

| actor                | dial                      | floor                                                                               |
| -------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| catalog poll         | discovery interval        | taste; ~5 min is where returns stopped when last measured                           |
| scope scheduler      | per-tier refresh interval | a **floor cadence**: every scope observed at least every N hours regardless of tier |
| canonicalizer        | run interval, pass range  | —                                                                                   |
| store ingest         | run interval              | —                                                                                   |
| alerts / Convex push | run interval              | —                                                                                   |

⚠️ The floor cadence is not optional. A volatility-driven scheduler is the one **cycle** in an
otherwise acyclic design — a derived product deciding what Layer 0 looks at. Interpretation can be
re-run; a fetch we didn't make cannot. With a floor, the worst case of a scheduler bug is reduced
resolution. Without one, it is a permanent blind spot.

## 7. ⚠️ What the pool costs — build this at the same time

[direction.md](direction.md) currently claims:

> it is **one pipeline**: it advances or it visibly fails at a step, so the failure mode where the
> catalog keeps updating while the change feed silently stalls cannot recur.

**The Artifact Pool gives that property up on purpose.** Independent dials mean a consumer can stall
silently while everything upstream looks healthy — which is precisely the Convex failure this whole
rework is replacing (`current-system.md`: materialize tolerates parse failures, materializedChanges
throws on the same input).

The replacement guarantee is **watermark lag as a first-class, monitored, alarmed quantity**: every
consumer's cursor distance from the pool head. This is the only part of the proposal I'd call
non-negotiable, and it has to ship _with_ the pool rather than after it. A pool without lag
monitoring is strictly worse than the pipeline it replaces.

## 8. HTTP manners (independently worth doing)

Two gaps in `capture-workflow.ts` that the "what if OpenRouter asks us to stop" question exposes:

- ⚠️ **We are anonymous.** Both fetches send only `accept: application/json`. An unidentified crawler
  at 41.6k requests/day gets blocked without a conversation; an identified one with a contact URL
  gets an email first. A descriptive `User-Agent` is the cheapest high-value change on this list.
- ⚠️ **We cannot hear them say no.** `observe()` retries on transport failure only —
  `Effect.retry({ times: 2 })` over a `tryPromise` that does not throw on `!res.ok`. A 429 or 503 is
  recorded as an observation and the sweep continues at full rate. If OR starts throttling we would
  bank ~433 × 429 per pass and keep hammering, discovering it whenever someone next read a status
  tally. Status-class-aware backoff plus an alarm on sustained 429s is what makes "they asked us to
  stop" arrive as an event rather than an archaeology finding.

📌 Note the reason volume has been fine so far: we hit their Cloudflare cache and never cache-bust,
so origin load is near zero. Request count is not the risk; origin load and anonymity are.

## 9. What this contradicts

**`direction.md`**

- The R2 layout sketch (`raw/<captured_at>/…`, `derived/changesets/<version>/<prev>_<captured_at>`)
  — `<prev>` is undefined without aligned passes.
- "The pipeline" §, the one-pipeline property — see §7 above.
- "Platform first, mechanisms last" — scheduler state (per-scope last-observed + volatility tier) is
  new coordination state, which that principle warns against. The honest framing: it is a **derived,
  rebuildable cache** with the same status as the normalized store, never a system of record. Worth
  keeping the tension visible rather than resolving it by assertion.

## 10. Open questions

- ❓ Should tiering key on **scope** or **endpoint**? The flap lives on endpoints, and a scope with
  one volatile endpoint drags its static siblings along at the same cadence.
- ❓ Floor cadence expressed in time, or in "at least once per N observations"? They diverge exactly
  when the budget is cut — i.e. when it matters.
- ❓ Does the raw layer land through Pipelines, or does the Worker keep writing R2 objects directly
  with Pipelines used only for the canonical/analytics tables? The former is simpler; the latter
  keeps Layer 0 free of a beta dependency.
- ❓ How does the 1+ year archival back-catalogue, whose cadence already varies, enter the pool? It is
  the existence proof that the irregular model is the only correct one — and the first real test of
  the era adapters.
- ❓ Is there any _other_ place we have quietly taken a dependency on upstream infrastructure rather
  than upstream data? The header idea got as far as a written time model before it was caught.
