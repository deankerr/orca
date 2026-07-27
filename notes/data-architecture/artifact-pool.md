# The Artifact Pool

**Built: `apps/pool`.** Producers append. Each consumer holds its own cursor and reads everything
past it at whatever cadence it likes. That is the entire coordination mechanism, and it is what makes
cadence a **dial** — adjustable at any time, per actor, without negotiating with any other actor.

The pool knows nothing about what it carries. That property is the whole point, and it is enforced by
there being no OpenRouter code in it.

Annotations: 📌 = measured, ⚠️ = landmine, ❓ = open.

## Why there is no "pass"

📌 A uniform sweep is almost entirely wasted. Across 39 transitions, with telemetry and embedded
entity copies stripped:

|                                        |                                 |
| -------------------------------------- | ------------------------------- |
| scope-observations carrying any change | **841 / 16,887 = 5.0%**         |
| scopes that moved at all in 10h        | **75 of 433** — 358 never moved |
| top mover (`z-ai/glm-5.2`)             | **38 of 39** transitions        |
| raw bodies identical to previous pass  | 13.4%                           |

⚠️ That last row kills the obvious storage fix — raw bodies barely dedupe, because embedded telemetry
churns on every fetch. The only way to not store the noise is to not fetch it.

📌 And the catalog can't tell us what to fetch: it carries only the _top_ endpoint per model, so as a
change detector for endpoint scopes it scores **recall 3.2%** (caught 27, missed 814, 427 false
alarms). The false alarms matter too — the catalog and `stats/endpoint` are independently cached, so
they disagree about the same endpoint. A catalog-embedded endpoint is never a substitute for an
observation of one.

So the catalog answers _what exists_ and nothing more; everything else is scheduled per scope. Once
scopes are scheduled independently, passes are no longer aligned, and the pass stops existing as a
concept. The pool is what replaces it.

## The time model

**There is exactly one time axis, it is ours, and it is `observed_at`: the moment we made the
request.**

We never observe events. Upstream is cached, so what we are handed was generated at some earlier
moment we cannot know, and the same bytes can be served to us twice. The only defensible claim is an
interval bounded by our own requests:

> A change occurred somewhere in `(previous observed_at, this observed_at]`.

⚠️ Conservative on purpose. Upstream staleness only ever makes the true moment _earlier_ than our
lower bound, never later, so a claim stated this way is never wrong — only imprecise, by an amount we
don't pretend to know.

⛔ **Response headers are not a time source.** `date - age` looks like it recovers when upstream
actually generated the data. It cannot be part of the system: it couples our time axis to
infrastructure we don't control (cache TTLs, header semantics, which CDN sits in front of OR — all
theirs to change silently), it is absent from the 1+ year back-catalogue, and `cf-cache-status: HIT`
sends no `age` at all, so ~15% of observations couldn't be placed even in principle. The findings
stay in [openrouter.md](openrouter.md) as context for _where to set the dial_. They never become a
column, a key, or an input to any derived layer.

📌 **No consumer may assume a regular grid** — no "previous pass", no aligned observation set, no
interval arithmetic. This is already true of the existing archives, whose cadence varies. Making it
the only case is what makes the dial free: no code path can depend on cadence, because none can
observe it.

## The envelope

Six producer-written columns plus the one Cloudflare adds. `kind`, `subject`, `attrs` and `payload`
are opaque — the pool validates that they are well formed, never that they mean anything.

```
kind        string     opaque family discriminator      e.g. 'openrouter.endpoints'
subject     string     opaque identity of the observed  e.g. 'z-ai/glm-5.2|standard'
observed_at timestamp  the time axis above, and the only one
producer    string     who appended it, versioned       e.g. 'capture@1'
attrs       json       producer-controlled escape hatch
payload     json       opaque — { status, headers, body } lives in here
__ingest_ts timestamp  Cloudflare's own; the cursor axis, never a claim about the world
```

Three decisions worth knowing:

- **`status` and `headers` live inside `payload`.** They are HTTP specifics, and the rule is that no
  layer above may read them. Burying them in an opaque field makes that structural rather than a rule
  someone has to remember not to break.
- **A scope triple is one opaque `subject`.** `slug|permaslug|variant` is the producer's convention;
  the pool never parses, splits or joins on it.
- ⚠️ **`subject`, not `key`.** `KEY` is reserved in standard SQL and this column name is read by two
  SQL engines we don't control.

⚠️ **The stream schema, the sink and the pipeline have no update API** — any change replaces them, and
the table with it. `attrs` exists so a producer needing another field never forces that.

📌 We deliberately don't use Iceberg's schema evolution. In-place evolution exists for people who
_cannot re-derive_ their tables. We can, and re-derivation is strictly more powerful — it restructures
retroactively rather than only appending columns. Iceberg for the query side; re-derivation as the
schema-change mechanism.

## The shape

```
producer ──POST /append──▶ Pipelines Stream ──SQL passthrough──▶ Iceberg table in R2
                                                                        │
consumer ◀──GET /read / POST /commit── Worker ──R2 SQL over HTTP───────┘
                                          │
                                          └── D1: one cursor per consumer
```

The pipeline transforms nothing. That is the one place a transform _could_ live and the whole point is
that it doesn't: interpretation happens in consumers, which can be re-run, not in the ingest path,
which cannot.

📌 **This deletes the batching problem outright.** The old `CHUNK_SIZE = 40` existed because of
Workflow subrequest budgets and checkpoint size, and the `<part>.jsonl.gz` key layout was that
constant fossilised. Under a stream the producer emits one record per observation and stops caring
about file layout entirely. The constant has no successor.

📌 **Managed compaction and snapshot expiration are the reason to use the catalog at all.** A sink
rolling a file a minute produces ~525k small files a year, and small-file accumulation is the standard
way a lakehouse rots. Left to Cloudflare on purpose.

All three API tokens — `Workers R2 Data Catalog Read/Write`, `Workers R2 SQL Read`,
`Pipelines Send` — are declared as stack resources, so they are scoped and destroyed with it.

⚠️ **But that only works if the deploying credential can create tokens.** Minting an account API
token is `POST /accounts/{id}/tokens`, which needs `API Tokens > Write` — and Alchemy's **OAuth scope
catalogue has no token-management scope at all**, so an `alchemy login` OAuth profile cannot do it
and no re-login will help. Deploying this stack requires an API-token credential. See
[alchemy.md](alchemy.md) for that and for the R2 SQL HTTP endpoint.

## The protocol

- `POST /append` — validated against the envelope only, then chunked under the 5 MB ingest limit.
- `GET /read` — returns a settled window plus the `through` token that commits it.
- `POST /commit` — advances the cursor. Monotonic: a replayed commit is a no-op, never a rewind.
- `POST /reset` — reprocessing is a cursor reset. A new consumer starts at zero and backfills for
  free; there is no separate replay machinery.
- `GET /health` — lag per consumer; **503** when any consumer is past its budget.

A consumer that dies between read and commit re-reads the same window. At-least-once, which is why
every stage above the pool has to be idempotent.

⚠️ **The cursor axis is `__ingest_ts`, not Iceberg snapshots.** R2 SQL queries the table, not the
snapshot log, and exposes no snapshot-range syntax. `__ingest_ts` is strictly the pool's arrival
order, and never a time anyone may reason about the world with — that stays `observed_at`'s job.

### ⚠️ The settling window — load-bearing

A cursor on `__ingest_ts` is only safe if reads are bounded on **both** sides. Rows become visible in
batches when the sink rolls a file, so the newest part of the pool is always still arriving, and a row
can land carrying an `__ingest_ts` older than one already seen. A naive `WHERE __ingest_ts > cursor`
steps over it and never looks back — silent, permanent row loss, which is the exact failure class the
pool exists to eliminate.

So a read covers `(cursor, now − SETTLING]`, and the cursor advances to `now − SETTLING`, never to the
visible head. `SETTLING = 300s` against a 60s roll interval.

📌 This puts a ~5 minute floor on end-to-end freshness — below where the dial is useful against
OpenRouter's cache anyway, so it costs nothing here. It _would_ cost something for a faster source,
and the fix there is a shorter roll interval, not a shorter settling.

⚠️ **A row `LIMIT` cannot be committed as a window.** Rows share an `__ingest_ts` to the millisecond,
so no row-count boundary is also a safe cursor position — only a time boundary is. The pool therefore
**halves the window until its rows fit** rather than truncating, at the cost of a `COUNT` per read.
The invariant it buys: _a committed window was delivered in full._

## What the pool costs, and what pays for it

Independent dials mean a consumer can stall silently while everything upstream looks healthy. That is
the property a single pipeline gave for free, given up on purpose — and it is precisely the failure
mode being replaced, so it has to be bought back explicitly.

**Watermark lag**, computed on a 5-minute cron. Two quantities, and the split matters:

- **ingest lag** — `now − MAX(__ingest_ts)`. Nothing about any consumer's cursor reveals a dead
  producer or a stalled pipeline; without this the pool can look perfectly healthy and be empty.
- **consumer lag** — `MAX(__ingest_ts) − cursor`, per consumer. The silent stall.

📌 A consumer that is behind _and advancing_ is working through a backlog, not stalled. `updated_at`
on the cursor row is what tells the two apart; lag alone cannot.

## Open

- ❓ **Delivery.** Lag is computed, logged and probeable, but nothing pages anyone. Routing a sustained
  stall to Discord is the obvious next step.
- ❓ **The back-catalogue.** How does 1+ year of archives, whose cadence already varies, enter the
  pool? It is the existence proof that the irregular model is the only correct one — and the first
  real test of the era adapters.
- ❓ **Scheduler tiering: scope or endpoint?** The flap lives on endpoints, and a scope with one
  volatile endpoint drags its static siblings along at the same cadence.
- ❓ **Floor cadence in time, or in "at least once per N observations"?** They diverge exactly when the
  budget is cut — i.e. when it matters. ⚠️ Whichever it is, the floor is not optional: a
  volatility-driven scheduler is the one **cycle** in an otherwise acyclic design, a derived product
  deciding what Layer 0 looks at. Interpretation can be re-run; a fetch we didn't make cannot. With a
  floor, the worst case of a scheduler bug is reduced resolution. Without one, it is a permanent blind
  spot.
- ❓ **Where else have we depended on upstream _infrastructure_ rather than upstream _data_?** The
  header idea got as far as a written time model before it was caught.

## Not the pool's problem

The pool is transport-agnostic and never makes an upstream request. These belong to the producer and
consumers built on top of it: the catalog poll and per-scope scheduler, HTTP manners (`User-Agent`,
429 backoff — see [openrouter.md](openrouter.md)), canonicalization, the normalized store, and the
alerts push.

⚠️ The scheduler's state (per-scope last-observed, volatility tier) is new coordination state, which
"platform first, mechanisms last" in [direction.md](direction.md) warns against. The honest framing:
it is a **derived, rebuildable cache**, never a system of record — the same status as the cursor
registry. Worth keeping the tension visible rather than resolving it by assertion.
