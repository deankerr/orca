# engine

Cloudflare Worker that captures OpenRouter endpoint data and projects a current view into Convex.

```
cron / POST /capture
  → catalog → Work queue
  → fetch endpoints → R2 observation (+ Entities clocks)
  → best-effort Convex upsert
```

Capture writes immutable evidence. Delivery is best-effort after the archive write.

## Layout

| Path                   | Role                                |
| ---------------------- | ----------------------------------- |
| `src/worker.ts`        | Composition root: cron, queue, HTTP |
| `src/capture/`         | Plan, fetch, store, entity clocks   |
| `src/delivery/`        | Product cards → Convex              |
| `src/resources/`       | Alchemy bindings (R2, queue, D1)    |
| `migrations/entities/` | D1 schema                           |

Product decode lives in `@orca/entities`.

## Storage

**Observations (R2)** — kind-prefixed, temporal-major, gzip JSON:

```
endpoints/{observedAt}/{scopeKey}.json.gz   # endpoints body as received
catalogs/{observedAt}.json.gz               # catalog for that sample
```

`observedAt` is an instant (`2026-08-11T12-34-56Z`). `scopeKey` is `author.model.variant` (`/` → `.`). Full-sample Work carries a shared `observedAt` so endpoints cluster under the same time; otherwise it is minted at process time.

**Entities (D1)** — first/last detected clocks for scopes and endpoint ids.

**Work (queue)** — `{ permaslug, variant, observedAt? }` per message.

## Ops HTTP

| Method | Path       |                     |
| ------ | ---------- | ------------------- |
| `GET`  | `/`        | Entity row counts   |
| `POST` | `/capture` | Start a full sample |

Env (deploy/runtime via Alchemy `Config`): `CONVEX_SITE_URL`, `ENGINE_HTTP_API_KEY`.

## Failures

- **Capture / R2 / work decode** — fail the message; queue retries.
- **Entities / Convex** — best-effort; log and continue. Archive already written.
- **OpenRouter** — 429/5xx retried briefly, then settled status is stored. Catalog failure aborts the plan (nothing queued).

## Commands

```bash
bun run --cwd apps/engine dev
bun run --cwd apps/engine deploy
```
