# engine

Cloudflare Worker that captures OpenRouter endpoint data and projects it through product sinks (today: Convex current-view).

```
cron / POST /capture
  → catalog → Work queue
  → fetch endpoints → Observations R2 (+ Entities clocks)
  → Sinks queue (windowed batch, ObservationRef only)
  → load bodies → fan-out sinks (best-effort)
```

Capture writes immutable evidence. Sinks are disposable product projections on a separate queue after archive write.

## Layout

| Path                    | Role                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `src/worker.ts`         | Composition root: bindings, wire consumers, cron, HTTP           |
| `src/observations/`     | Shared archive service (keys, gzip R2 put/get, `ObservationRef`) |
| `src/capture/`          | Plan, message, process, consume (Work queue)                     |
| `src/sinks/`            | Types, process, consume (Sinks queue) + product sinks            |
| `src/sinks/delivery/`   | Convex current-view sink (project + push)                        |
| `src/sinks/public-api/` | Public API projection sink (scaffold / no-op)                    |
| `src/resources/`        | Alchemy bindings (R2, queues, D1)                                |
| `migrations/entities/`  | D1 schema                                                        |

Product decode lives in `@orca/entities` (or the sink package). Adding a sink: `make(deps): Sink` (see `sinks/types.ts`), append to the list in `worker.ts`. Plugins run concurrently; the bus isolates failures.

## Queues

**Work** — one message = one `(permaslug, variant)` capture attempt. On success, enqueue a Sinks message with an `ObservationRef` only.

**Sinks** — windowed batch of successful captures. Loads bodies from R2 once, fans out to each sink. Hard error boundary: sink failures are logged and the batch is acked (never redrives Work / OpenRouter).

## Storage

**Observations (R2)** — kind-prefixed, temporal-major, gzip JSON:

```
endpoints/{observedAt}/{scopeKey}.json.gz   # validated endpoints `{ data }` envelope
catalogs/{observedAt}.json.gz               # validated catalog `{ data }` envelope
```

Full-sample Work carries a shared `observedAt` so endpoints cluster under the same time; otherwise it is minted at process time.

**Entities (D1)** — first/last detected clocks for scopes and endpoint ids.

## Ops HTTP

| Method | Path       |                     |
| ------ | ---------- | ------------------- |
| `GET`  | `/`        | Entity row counts   |
| `POST` | `/capture` | Start a full sample |

Env (deploy/runtime via Alchemy `Config`): `CONVEX_SITE_URL`, `ENGINE_HTTP_API_KEY`.

## Observability

Workers Logs messages use `<phase>: <event>`. Filter on annotation `phase`:

| Phase          | Where                               |
| -------------- | ----------------------------------- |
| `plan`         | Full sample start                   |
| `capture`      | Process / non-200 / entities        |
| `observations` | R2 store I/O                        |
| `work`         | Work consumer failures              |
| `sinks`        | Bus load / fan-out / batch boundary |
| `delivery`     | Convex project + upsert             |
| `ops`          | HTTP                                |

## Failures

- **Capture / R2 / work decode / sink enqueue** — fail the Work message; queue retries.
- **Entities** — best-effort; log and continue. Archive already written.
- **Sinks bank (decode / R2)** — fail loud, log, ack (no retries). Does not re-query OpenRouter.
- **Sink plugins** — isolated: one plugin failure is logged and ignored; others still run.
- **OpenRouter** — 429/5xx retried briefly, then settled. Non-200 is logged and not archived. Catalog failure aborts the plan (nothing queued). Only validated `{ data }` envelopes are persisted.

## Commands

```bash
bun run --cwd apps/engine dev
bun run --cwd apps/engine deploy
```
