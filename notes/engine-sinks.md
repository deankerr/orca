# Engine sinks

Promote the post-capture “delivery” path into an explicit **Sink** concept. Do this before (or as the substrate for) the public API cut-over. Today’s Convex push is a proto-sink; public API will be another.

Related: `notes/public-api.md`.

## Problem

- Capture Work is correctly **one queue message per endpoint request**.
- That grain should **not** flow straight through to every product sink.
- Per-message fan-out is wasteful (many small HTTP posts, thrashing materializers).
- Tuning **one** queue for both capture and sinks couples unrelated failure domains and timing policies.

## Intent

```
Work queue  (fine grain, capture-tuned)
  → capture (Observations + Entities)     # per-scope; retry = re-query / re-archive
  → enqueue sink event(s)                 # after successful archive only
        │
Sinks queue  (windowed batch: size | wait)
  → bank of sink events
  → fan-out to sinks (best-effort each)
```

Capture remains the source of immutable evidence. Sinks are disposable product projections. **No plan “finished” signal** — the Sinks consumer uses a size-or-time batch window; the tail of a sample flushes on `maxWaitTime`.

## Why two queues (decided)

A single queue cannot cleanly serve both roles:

| Concern                                   | Single queue                                                                                                 | Two queues                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Capture timing / concurrency / batch size | Shared with sink batching — retune one, disturb the other                                                    | Work knobs independent of sink window                                       |
| Sink outage or handler bug                | Risk of **retrying capture Work** (re-hit OpenRouter, re-write R2) if delivery sits in the same ack boundary | Sink retries only **Sinks** messages; archive already durable               |
| Alchemy/CF ack model                      | Batch success/failure is coarse; mixing phases invites whole-batch redrive of capture                        | Capture acks when archived (+ sink enqueue); sink batch has its own ack     |
| Windowed batch for sinks                  | Forces capture into the same window (delay or fat batches of OpenRouter work)                                | Sinks queue: high `batchSize` + `maxWaitTime`; Work can stay `batchSize: 1` |

**Yes — sink failures on a shared queue can cause endpoint queries to be repeated**, unless every sink path is carefully `catch`ed and never fails the Work handler. That is brittle: one thrown error, Alchemy whole-batch retry, or a future “stricter” sink policy re-couples product delivery to capture cost. A second queue makes the invariant structural: **Work retry ⇒ capture; Sinks retry ⇒ projection only.**

### Banking term

**Windowed batch** (size **or** time), not debounce/throttle. Platform primitive: Cloudflare Queues `max_batch_size` + `max_batch_timeout` (Alchemy: `batchSize` + `maxWaitTime` on `consumeQueueMessages`).

## Flow detail

```
Work message { permaslug, variant, observedAt? }
  → fetch OpenRouter → put Observation → touch Entities (best-effort)
  → on observed success: send Sinks message (small payload)
  → ack Work

Sinks message (prefer refs, not full bodies)
  e.g. { scopeKey, observedAt, status } + R2 key convention
  → consumer batch (N | T)
  → load bodies from Observations as needed (or pass through if tiny)
  → sinks.receive(batch)
```

Enqueue to Sinks is part of **successful capture completion**. If sink-enqueue itself fails, that _may_ retry Work (same as failing after R2 today) — keep the send small and reliable; optional later: outbox pattern. Do **not** wait for sink product HTTP inside Work.

## Who banks?

| Layer               | Policy                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------- |
| **Sinks queue**     | Engine-level bank: windowed batch before fan-out                                       |
| **Individual sink** | May debounce further (e.g. public API blob rebuild) — product-local, fine to duplicate |

No end-of-sample signal from the capture plan.

## Sketch (Effect)

Not prescriptive API — direction of travel:

- **Work consumer:** capture only; on success, `sinksQueue.send` (or `sendBatch` if multi); isolated entities errors as today.
- **Sinks consumer:** `consumeQueueMessages` with large `batchSize` + short `maxWaitTime`; `process(stream)` collects batch → fan-out.
- A **sink**: given a batch of successful capture refs/payloads, do product work; typed errors; log; must not require Work redrive.
- Fan-out: concurrent Effects with isolated failure so one sink outage does not block others (and ideally does not fail the whole Sinks batch unless we want redrive of the bank — prefer per-sink catch + ack batch when archive refs were processed).
- Packages receive deps from engine; they do not import `apps/engine`.

## Relation to existing code

| Area                                                           | Status                                       |
| -------------------------------------------------------------- | -------------------------------------------- |
| `resources/Sinks.ts` + Work enqueue after capture              | **In place**                                 |
| Sinks windowed batch → `delivery/current.deliverMany` (Convex) | **In place**                                 |
| Hard error boundary on Sinks (ack always, `maxRetries: 0`)     | **In place**                                 |
| Multi-sink fan-out / per-sink queues                           | Later                                        |
| R2 refs on Sinks messages (not body)                           | **In place** (128 KB limit hit on large obs) |

## Non-goals

- Exactly-once sink delivery
- Shared projection store across sinks
- Unifying Convex + public API schemas
- End-of-sample / plan-complete coupling
- Tuning one queue for both capture and sinks

## Success

- Capture concurrency and sink batch windows are independent dials.
- Sink failures do not re-query OpenRouter or re-drive capture Work.
- Adding a sink does not change Work message shape or capture path.
- Sinks receive windowed batches; public API can attach as another sink later.
