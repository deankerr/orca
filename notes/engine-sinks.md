# Engine sinks

**Status:** design in force in `apps/engine`; still evolving under real sample volume and multi-sink product load. Related: `notes/public-api.md`, `apps/engine/README.md`.

Post-capture product delivery is an explicit **Sink** concept, not part of capture. Capture writes immutable evidence; sinks are disposable product projections. Convex current-view is the first real sink; public API is the next (scaffold only).

---

## Problem

- Capture is correctly **one queue job per scope sample** (fine grain, OpenRouter-bound).
- That grain should **not** flow straight through to every product sink.
- Per-message product fan-out is wasteful (many small HTTP posts, thrashing materializers).
- Tuning **one** queue for both capture and product delivery couples unrelated failure domains and timing policies.

---

## Intent

```
CaptureQueue  (fine grain, capture-tuned)
  → sample (ObservationStore + EntityClocks)
  → enqueue ObservationRef after successful archive only
        │
SinksQueue  (windowed batch: size | wait)
  → bank of refs
  → decode + load bodies once
  → fan-out to sink plugins (best-effort each; isolated)
```

No plan “finished” signal. The sinks consumer uses a size-or-time batch window; the tail of a sample flushes when the wait elapses.

---

## Why two queues

A single queue cannot cleanly serve both roles:

| Concern                               | Shared queue                                                                                            | Two queues                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Timing / concurrency / batching       | Capture and sink batching share dials — retune one, disturb the other                                   | Independent policies                                                   |
| Sink outage or handler bug            | Risk of **retrying capture** (re-hit OpenRouter, re-write R2) if delivery sits in the same ack boundary | Sinks retries only projection work; archive already durable            |
| Ack model (CF queues are batch-level) | Mixing phases invites whole-batch redrive of capture                                                    | Capture acks when archived (+ sink enqueue); sink bank has its own ack |
| Windowed product batching             | Forces capture into the same window (delay or fat batches of OpenRouter work)                           | Capture stays fine-grained; sinks bank on their own                    |

**Yes — sink failures on a shared queue can cause endpoint queries to be repeated**, unless every sink path is carefully caught and never fails the capture handler. That is brittle. A second queue makes the invariant structural:

> **CaptureQueue retry ⇒ re-sample. SinksQueue path ⇒ projection only.**

### Banking term

**Windowed batch** (size **or** time), not debounce/throttle. Platform primitive: Cloudflare Queues batch size + batch timeout on the consumer. Exact knobs live in code and will move under load — do not treat them as design constants here.

---

## Why this bus shape

### 1. Capture never waits on product I/O

After archive, capture only enqueues a small **ObservationRef**. Product HTTP, blob rebuilds, and decode failures must not sit in the capture ack path.

### 2. Bodies stay in the archive

Queue payload is ref-only (queue size limits; no dual write of large JSON). The bus loads R2 once per bank; plugins receive bodies, not a store handle.

### 3. Load once, fan out many

N plugins on the same bank must not each re-fetch the same objects. The bus owns decode + load; plugins own transform + external I/O.

### 4. Strict internal bus, soft plugins

| Failure                          | Behavior                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Bad ref / batch decode           | Fail loud — **we** enqueued these; treat as defect; ack bank (do not redrive capture) |
| Missing R2 body                  | Same — we only enqueue after put                                                      |
| Plugin / network / product error | Isolated: log, continue; **other plugins still run**                                  |
| Entity clocks (D1)               | Best-effort in capture; never fails the job after archive                             |

No soft-skip of “good messages in a bad bank” for decode/load. Soft only at the **product** edge (e.g. one row fails product schema).

### 5. Plugins implement a port, not a framework

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
- Each plugin owns its transform and external I/O privately.
- Typed product errors are allowed; the bank **erases** them so one plugin cannot fail the bank or redrive capture.
- Composition root holds a fixed list of `make(deps): Sink` adapters. No `Context.Service` / Layer registry unless composition complexity forces it.

### 6. Who banks?

| Layer               | Policy                                                              |
| ------------------- | ------------------------------------------------------------------- |
| **Sinks queue**     | Engine-level bank before fan-out (shared across products)           |
| **Individual sink** | May debounce further (e.g. public API blob rebuild) — product-local |

No end-of-sample signal from the full-sample plan.

### 7. Boundaries that stay firm

- Packages do not import `apps/engine` — engine injects deps when a sink is extracted.
- No shared projection store across sinks; no unified Convex/public-API schema.
- Adding a sink does not change capture job shape or the capture path.

---

## Plugins (roles, not paths)

### Convex current-view — real

Projects archive bodies to product endpoint cards and upserts Convex current-view. Empty projection is success (no push), not a sink failure. Unprojectable rows may soft-skip at the product edge.

### Public API V2 — real

`@orca/public-api-v2`: transform raw batches → upsert model documents in isolated D1; GET assembles V2 JSON with relative stale filter. See `notes/public-api.md`.

---

## Open / unproven

| Area                  | Question                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| End-to-end sample     | Full sample → CaptureQueue → SinksQueue → products under real catalog size      |
| Bank knobs            | Right window for product HTTP + (later) public-api ingest?                      |
| Concurrent plugins    | Fine at small N; contention when public-api does real writes?                   |
| Enqueue after archive | Sink-enqueue failure still retries capture (re-hit OR) — outbox later if needed |
| Per-sink queues       | Only if products need independent retry/window dials                            |
| Missing R2            | Should stay “fail loud”; confirm no race under load                             |
| Product row soft-skip | Right long-term policy for unprojectable rows?                                  |
| Public-api extract    | Scaffold in engine vs package boundary timing                                   |

---

## Non-goals

- Exactly-once sink delivery
- Shared projection store across sinks
- Unifying Convex + public API schemas
- End-of-sample / plan-complete coupling
- One queue for both capture and sinks
- Effect Service/Layer plugin registry (unless forced)

---

## Success criteria

- Capture concurrency and sink batch windows are independent dials.
- Sink failures do not re-query OpenRouter or redrive capture.
- Adding a sink does not change capture job shape or path.
- Sinks receive windowed batches of **raw** archive evidence.
- Public API attaches as another plugin without reshaping the bus.
