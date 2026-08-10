# engine

Cloudflare Worker that captures OpenRouter endpoint data and projects a current view into Convex.

```
cron / POST /capture
  → catalog → Work queue
  → fetch endpoints → R2 observation (+ Entities clocks)
  → best-effort Convex upsert
```

Capture writes immutable evidence. Delivery is disposable and never redrives the archive.

## Layout

| Path                   | Role                                |
| ---------------------- | ----------------------------------- |
| `src/worker.ts`        | Composition root: cron, queue, HTTP |
| `src/capture/`         | Plan, fetch, store, entity clocks   |
| `src/delivery/`        | Product cards → Convex              |
| `src/resources/`       | Alchemy bindings (R2, queue, D1)    |
| `migrations/entities/` | D1 schema                           |

Product decode lives in `@orca/entities`, not here.

## Storage

**Observations (R2)** — temporal-major, gzip JSON:

```
{observedAt}/{scopeKey}.json.gz   # endpoints body as received
{observedAt}/catalog.json.gz      # inventory for that plan moment
```

`observedAt` is an instant (`2026-08-11T12-34-56Z`). `scopeKey` is `author.model.variant` (`/` → `.`).

**Entities (D1)** — first/last detected clocks for scopes and endpoint ids. Not a product cache.

**Work (queue)** — `{ permaslug, variant }` per message.

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
