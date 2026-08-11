# engine

Cloudflare Worker that captures OpenRouter endpoint data and projects a current view into Convex.

```
cron / POST /capture
  → catalog → Work queue
  → fetch endpoints → R2 observation (+ Entities clocks)
  → Sinks queue (windowed batch)
  → best-effort Convex upsert
```

Capture writes immutable evidence. Delivery is best-effort on a separate queue after archive write.

## Layout

| Path                   | Role                                    |
| ---------------------- | --------------------------------------- |
| `src/worker.ts`        | Composition root: cron, queues, HTTP    |
| `src/capture/`         | Plan, fetch, store, entity clocks       |
| `src/delivery/`        | Sinks messages + product cards → Convex |
| `src/resources/`       | Alchemy bindings (R2, queues, D1)       |
| `migrations/entities/` | D1 schema                               |

Product decode lives in `@orca/entities`.

## Queues

**Work** — one message = one `(permaslug, variant)` capture attempt.

- Consumer: `batchSize: 1`, `maxConcurrency: 4`, `maxRetries: 3`
- On successful observation: enqueue a Sinks message (`observedAt` + `scopeKey` R2 ref)

**Sinks** — successful captures for product sinks (today: Convex current).

- Consumer: windowed batch `batchSize: 25` **or** `maxWaitTime: 15s`
- Loads observation bodies from R2, projects the batch → **one** Convex upsert
- Hard error boundary: delivery failures are logged and the batch is acked (never redrives Work / OpenRouter)
- Messages stay under the 128 KB queue limit (bodies are not inlined)

## Storage

**Observations (R2)** — kind-prefixed, temporal-major, gzip JSON:

```
endpoints/{observedAt}/{scopeKey}.json.gz   # endpoints body as received
catalogs/{observedAt}.json.gz               # catalog for that sample
```

`observedAt` is an instant (`2026-08-11T12-34-56Z`). `scopeKey` is `author.model.variant` (`/` → `.`). Full-sample Work carries a shared `observedAt` so endpoints cluster under the same time; otherwise it is minted at process time.

**Entities (D1)** — first/last detected clocks for scopes and endpoint ids.

## Ops HTTP

| Method | Path       |                     |
| ------ | ---------- | ------------------- |
| `GET`  | `/`        | Entity row counts   |
| `POST` | `/capture` | Start a full sample |

Env (deploy/runtime via Alchemy `Config`): `CONVEX_SITE_URL`, `ENGINE_HTTP_API_KEY`.

## Failures

- **Capture / R2 / work decode / sink enqueue** — fail the Work message; queue retries.
- **Entities** — best-effort; log and continue. Archive already written.
- **Sinks / Convex** — best-effort; log and ack. Does not re-query OpenRouter.
- **OpenRouter** — 429/5xx retried briefly, then settled status is stored. Catalog failure aborts the plan (nothing queued).

## Commands

```bash
bun run --cwd apps/engine dev
bun run --cwd apps/engine deploy
```
