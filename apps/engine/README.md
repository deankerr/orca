# engine

Cloudflare Worker that captures OpenRouter endpoint data and projects it through product sinks (today: Convex current-view).

```
cron / POST /capture
  → catalog → CaptureQueue
  → fetch endpoints → Observations R2 (+ EntityClocks)
  → SinksQueue (windowed batch, ObservationRef only)
  → load bodies → fan-out sinks (best-effort)
       including public-api-v2 → isolated D1 current models
GET /public-api/v2/models → assemble V2 JSON from D1 (relative stale filter)
```

Capture writes immutable evidence. Sinks are disposable product projections on a separate queue after archive write.

## Layout

| Path                        | Role                                                           |
| --------------------------- | -------------------------------------------------------------- |
| `src/worker.ts`             | Composition root: resources, clients, wire pipelines, ops HTTP |
| `src/observations/`         | Deep module: `ObservationArchive`, refs, R2 implementation     |
| `src/entities/`             | Deep module: first/last seen clocks (D1)                       |
| `src/capture/`              | Deep module: `wire`, `startFullSample` (impl private)          |
| `src/sinks/`                | Deep module: `wire` + `Sink` port; bank/consume are impl       |
| `src/sinks/convex-current/` | Product adapter: Convex current-view (`make`)                  |
| `src/resources/`            | Alchemy resources (R2, D1s, queues)                            |
| `migrations/entities/`      | EntityClocks D1 schema                                         |
| `migrations/public-api-v2/` | Public API V2 current-models D1 schema                         |

Deep modules export a small public surface via `index.ts`. Implementation files are not import targets for the composition root.

Product decode lives in `@orca/entities` or product packages (e.g. `@orca/public-api-v2`). Adding a sink: `make(deps)` returning the Sink shape, append to the list in `worker.ts`. The bus isolates plugin failures.

## Queues

**CaptureQueue** — one message = one `(permaslug, variant)` capture attempt. On success, enqueue a SinksQueue message with an `ObservationRef` only.

**SinksQueue** — windowed batch of successful captures. Loads bodies from R2 once, fans out to each sink. Hard error boundary: sink failures are logged and the batch is acked (never redrives CaptureQueue / OpenRouter).

## Storage

**ObservationsBucket (R2)** — kind-prefixed, temporal-major, gzip JSON:

```
endpoints/{observedAt}/{scopeKey}.json.gz   # validated endpoints `{ data }` envelope
catalogs/{observedAt}.json.gz               # validated catalog `{ data }` envelope
```

Full-sample jobs carry a shared `observedAt` so endpoints cluster under the same time; otherwise it is minted at sample time.

**EntitiesDB (D1)** — first/last detected clocks for scopes and endpoint ids (`EntityClocks`).

**PublicApiV2DB (D1)** — current V2 model documents for `@orca/public-api-v2` (isolated from EntityClocks). Stale models are filtered on read relative to `max(updated_at)`, not wall clock.

## Ops HTTP

| Method | Path                    |                                    |
| ------ | ----------------------- | ---------------------------------- |
| `GET`  | `/`                     | Entity row counts                  |
| `GET`  | `/public-api/v2/models` | Public API V2 (`?limit=` optional) |
| `POST` | `/capture`              | Start a full sample                |

Env (deploy/runtime via Alchemy `Config`): `CONVEX_SITE_URL`, `ENGINE_HTTP_API_KEY`.

## Observability

Workers Logs messages use `<phase>: <event>`. Filter on annotation `phase`:

| Phase            | Where                                           |
| ---------------- | ----------------------------------------------- |
| `full-sample`    | Full sample start                               |
| `capture`        | Sample / queue consumer / entities              |
| `observations`   | R2 store I/O                                    |
| `sinks`          | Bus load / fan-out / batch boundary             |
| `convex-current` | Convex project + upsert                         |
| `public-api-v2`  | Public API V2 transform (`@orca/public-api-v2`) |
| `ops`            | HTTP                                            |

## Failures

- **Capture / R2 / job decode / sink enqueue** — fail the CaptureQueue message; queue retries.
- **Entity clocks** — best-effort; log and continue. Archive already written.
- **Sinks bank (decode / R2)** — fail loud, log, ack (no retries). Does not re-query OpenRouter.
- **Sink plugins** — isolated: one plugin failure is logged and ignored; others still run.
- **OpenRouter** — 429/5xx retried briefly, then settled. Non-200 is logged and not archived. Catalog failure aborts the plan (nothing queued). Only validated `{ data }` envelopes are persisted.

## Commands

```bash
bun run --cwd apps/engine dev
bun run --cwd apps/engine deploy
```
