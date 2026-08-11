# Engine sinks

**Status:** initial implementation in `apps/engine` — design still evolving. Wired and typechecked; not yet proven under real sample volume, multi-sink product load, or public-api cut-over.

Post-capture product delivery is an explicit **Sink** (plugin) concept, not part of capture Work. Convex current-view is the first real sink; public API is the next (scaffold only). Related: `notes/public-api.md`, `apps/engine/README.md`.

---

## Problem (unchanged)

- Capture Work is correctly **one queue message per endpoint request**.
- That grain should **not** flow straight through to every product sink.
- Per-message fan-out is wasteful (many small HTTP posts, thrashing materializers).
- Tuning **one** queue for both capture and sinks couples unrelated failure domains and timing policies.

---

## Intent

```
Work queue  (fine grain, capture-tuned)
  → capture (Observations + Entities)     # per-scope; retry = re-query / re-archive
  → enqueue ObservationRef                # after successful archive only
        │
Sinks queue  (windowed batch: size | wait)
  → bank of refs
  → decode + load bodies once             # strict internal bus
  → fan-out to sink plugins               # best-effort each; isolated
```

Capture remains the source of immutable evidence. Sinks are disposable product projections. **No plan “finished” signal** — the Sinks consumer uses a size-or-time batch window; the tail of a sample flushes on `maxWaitTime`.

---

## Why two queues (decided)

A single queue cannot cleanly serve both roles:

| Concern                                   | Single queue                                                                                                 | Two queues                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Capture timing / concurrency / batch size | Shared with sink batching — retune one, disturb the other                                                    | Work knobs independent of sink window                                       |
| Sink outage or handler bug                | Risk of **retrying capture Work** (re-hit OpenRouter, re-write R2) if delivery sits in the same ack boundary | Sink retries only **Sinks** messages; archive already durable               |
| Alchemy/CF ack model                      | Batch success/failure is coarse; mixing phases invites whole-batch redrive of capture                        | Capture acks when archived (+ sink enqueue); sink batch has its own ack     |
| Windowed batch for sinks                  | Forces capture into the same window (delay or fat batches of OpenRouter work)                                | Sinks queue: high `batchSize` + `maxWaitTime`; Work can stay `batchSize: 1` |

**Yes — sink failures on a shared queue can cause endpoint queries to be repeated**, unless every sink path is carefully caught and never fails the Work handler. That is brittle. A second queue makes the invariant structural: **Work retry ⇒ capture; Sinks path ⇒ projection only.**

### Banking term

**Windowed batch** (size **or** time), not debounce/throttle. Platform primitive: Cloudflare Queues `max_batch_size` + `max_batch_timeout` (Alchemy: `batchSize` + `maxWaitTime` on `consumeQueueMessages`).

---

## Current shape (implementation)

Code lives under `apps/engine/src/sinks/`. Composition root: `worker.ts`.

### Modules

| Path          | Role                                                      |
| ------------- | --------------------------------------------------------- |
| `types.ts`    | `ObservationItem`, `Sink<E>` plugin contract              |
| `adapt.ts`    | Safe plugin runner — log `Cause`, never fail the bank     |
| `process.ts`  | One bank: decode refs → load R2 once → concurrent plugins |
| `consume.ts`  | Queue window + outer ack (`maxRetries: 0`)                |
| `delivery/`   | Convex current-view plugin (project + push)               |
| `public-api/` | Scaffold plugin (log only until package lands)            |

Capture handoff: `capture/consume.ts` enqueues `{ observedAt, scopeKey }` (`ObservationRef`) after a successful observation.

### Flow (as built)

```
Work message { permaslug, variant, observedAt? }
  → fetch OpenRouter → validate → put Observation (validated `{ data }` only)
  → touch Entities (best-effort)
  → on observed: Sinks.send(ObservationRef)
  → ack Work

Sinks bank (batchSize 25 | maxWaitTime 15s)
  → decode ObservationRef[] once          # fail loud — we post these ourselves
  → load every body from Observations     # fail loud — enqueue only after put
  → ObservationItem[] = ref + body
  → for each Sink (concurrent): adapt(sink).receive(items)
  → always ack bank (maxRetries: 0)
```

### Plugin contract

```ts
type ObservationItem = {
  observedAt: string
  scopeKey: string
  body: string // validated archive JSON envelope
}

type Sink<E = unknown> = {
  name: string
  receive: (batch: ReadonlyArray<ObservationItem>) => Effect.Effect<void, E>
}
```

- **Input is raw archive evidence only** — not product cards, not V2 JSON.
- Each plugin owns its transform and external I/O (`delivery` projects to Convex cards privately).
- Typed product errors (`Sink<DeliveryError>`) are allowed; **`adapt` erases them** so one plugin cannot fail the bank or redrive Work.
- Wire: `make(deps): Sink` → list in `worker.ts` (`sinks: [delivery, publicApi]`).

### Bus vs plugin failure policy

| Failure                             | Layer              | Behavior                                                   |
| ----------------------------------- | ------------------ | ---------------------------------------------------------- |
| Bad `ObservationRef` / batch decode | process (internal) | Fail bank → consume logs error → **ack** (`maxRetries: 0`) |
| Missing R2 body                     | process (internal) | Same — treat as defect; we only enqueue after put          |
| Plugin / network / product error    | `adapt`            | Log warning + `Cause.pretty`; **other plugins still run**  |
| Entities (D1 clocks)                | capture process    | Best-effort; never fails Work after archive                |

**Strict internal bus, soft plugins.** No soft-skip of “good messages in a bad batch” for decode/load — producer is us.

### Queue knobs (starting values — unproven under load)

| Queue | Settings                                                                  | Notes                  |
| ----- | ------------------------------------------------------------------------- | ---------------------- |
| Work  | `batchSize: 1`, `maxConcurrency: 4`, `maxRetries: 3`                      | Capture-tuned          |
| Sinks | `batchSize: 25`, `maxWaitTime: 15s`, `maxConcurrency: 2`, `maxRetries: 0` | Bank-tuned; always ack |

Load + plugin fan-out use unbounded concurrency within a bank (small N). Retune when multi-sink I/O is real.

### Who banks?

| Layer               | Policy                                                              |
| ------------------- | ------------------------------------------------------------------- |
| **Sinks queue**     | Engine-level bank before fan-out                                    |
| **Individual sink** | May debounce further (e.g. public API blob rebuild) — product-local |

No end-of-sample signal from the capture plan.

---

## Plugins today

### `delivery` (Convex current-view) — real

- `project`: archive body → `@orca/entities` product cards (private; soft-skip rows product schema rejects).
- `push`: HTTP POST to Convex `/current/endpoints`; `DeliveryError` tagged.
- Empty projection = success (no push), not a sink failure.

### `public-api` — scaffold only

- Logs batch size; no transform/materialize yet.
- Intent: move to a package that exports `make(deps): Sink` (same contract); engine only feeds raw batches. See `notes/public-api.md`.

---

## Design intent still in force

These were decisions before the code; they still hold unless we revise them deliberately:

1. **Capture never waits on product HTTP** — only enqueue a small ref after archive.
2. **Bodies stay in Observations** — queue payload is ref-only (128 KB queue limit).
3. **Load once per bank** — bus resolves R2; plugins receive bodies (not Store).
4. **Plugins are not Context.Service layers** — fixed list of handler records at the composition root is enough for now.
5. **Packages do not import `apps/engine`** — engine injects deps when public-api is extracted.
6. **No shared projection store** across sinks; no unified Convex/V2 schema.

---

## Unproven / open

Track here as the design evolves; do not treat the current code as settled until exercised.

| Area                  | Open question                                                                |
| --------------------- | ---------------------------------------------------------------------------- |
| End-to-end sample     | Full plan → Work → Sinks → Convex under real catalog size                    |
| Bank knobs            | Is 25 / 15s right for delivery HTTP + (later) public-api ingest?             |
| Concurrent plugins    | Fine at N=2 scaffold; contention when public-api does real writes?           |
| Enqueue after archive | Sink-enqueue failure still retries Work (re-hit OR) — outbox later if needed |
| Per-sink queues       | Only if products need independent retry/window dials                         |
| Missing R2            | Should stay “fail loud”; confirm no race under CF load                       |
| Product row soft-skip | Delivery skips unprojectable rows; is that the right long-term policy?       |
| Public-api extract    | Scaffold in engine vs package boundary timing                                |

---

## Implementation checklist

| Area                                               | Status                         |
| -------------------------------------------------- | ------------------------------ |
| `resources/Sinks.ts` + Work enqueue after capture  | **In place**                   |
| Shared `observations/` archive (not capture-owned) | **In place**                   |
| `ObservationRef` queue messages (not bodies)       | **In place**                   |
| Sinks bus: types / adapt / process / consume       | **In place**                   |
| Strict decode + load; soft plugin adapter          | **In place**                   |
| Concurrent plugin fan-out                          | **In place**                   |
| Convex sink: `delivery/` (project + push + `make`) | **In place** (not load-proven) |
| Hard error boundary (`maxRetries: 0`, always ack)  | **In place**                   |
| Public-api sink                                    | **Scaffold only**              |
| Public-api package + resources + real ingest       | **Next**                       |
| Multi-sink under production traffic                | **Unproven**                   |
| Per-sink queues                                    | **Later if needed**            |

---

## Non-goals

- Exactly-once sink delivery
- Shared projection store across sinks
- Unifying Convex + public API schemas
- End-of-sample / plan-complete coupling
- Tuning one queue for both capture and sinks
- Effect `Context.Service` / Layer registry for plugins (unless composition complexity forces it)

---

## Success criteria

Still the bar; partial credit only until public-api and real samples pass through:

- Capture concurrency and sink batch windows are independent dials.
- Sink failures do not re-query OpenRouter or re-drive capture Work.
- Adding a sink does not change Work message shape or capture path.
- Sinks receive windowed batches of **raw** archive evidence.
- Public API attaches as another plugin without reshaping the bus.
