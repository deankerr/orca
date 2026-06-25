# ORCA

OpenRouter Capability Analysis — aggregates, analyzes, and visualizes AI model and provider data from [OpenRouter](https://openrouter.ai).

Live at [orca.orb.town](https://orca.orb.town).

## What it does

OpenRouter's catalog of models, providers, and endpoints changes constantly — pricing moves, endpoints appear and disappear, capabilities shift — and there's no built-in way to observe that history or compare offerings in depth. ORCA crawls OpenRouter on a schedule, stores each result as a historical snapshot, and derives a field-level change history from those snapshots.

That history powers a few things:

- **Endpoints Data Grid** — the primary browsing interface. A dense, filterable grid for comparing models and endpoints across capabilities, pricing, modalities, and supported parameters. Built on TanStack Table and Virtual to stay responsive over the full catalog. (`apps/web/components/endpoints-data-grid/`)
- **Monitor** — a change feed showing field-level diffs between snapshots, surfacing model, endpoint, and provider activity that is otherwise invisible. (`apps/web/components/monitor/`)
- **Model pages** — per-model overviews with pricing and capability detail. (`apps/web/app/model/`)
- **Discord alerts** — subscribe to model id patterns and receive a personalized version of Monitor in Discord. No frontend; driven entirely by the backend. (`packages/backend/convex/alerts/`, `packages/backend/convex/discord/`)
- **Public API** — an HTTP endpoint exposing the curated model/endpoint data. See [Public API](#public-api) below.

It's aimed at people who work with OpenRouter and LLMs directly — the kind of user who reads context lengths, quantization, and reasoning-token support closely and copies model slugs straight into their code. The presentation favors technical precision over simplification.

## Architecture

Turborepo monorepo. Next.js frontend on Vercel; Convex backend handling storage, scheduling, the crawl pipeline, Discord, and the public API.

| Workspace               | Role                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `apps/web`              | Next.js 16 / React 19 frontend — data grid, monitor, model pages, public API docs page      |
| `packages/backend`      | Convex backend — schema, crons, snapshot pipeline, change tracking, Discord bot, public API |
| `packages/entity-logos` | Resolves provider/author logo assets from multiple sources, with runtime slug mapping       |

### Data pipeline

1. **Crawl** — Convex crons fetch OpenRouter's data hourly and write the raw result to a snapshot archive. Each snapshot is identified by a `crawl_id`: a sortable, parseable timestamp string.
2. **Materialize** — snapshots are processed into the `or_views_*` tables (models, endpoints, providers) that back the UI.
3. **Changes** — consecutive snapshots are diffed (via `json-diff-ts`) into a field-level change history, which feeds Monitor and the Discord alerts.

Crawling is gated by `ORCA_CRAWL_CRON_ENABLED` so preview deployments don't keep gathering data after their branch is merged (see [Environment](#environment)).

### Stack

TypeScript throughout. Next.js 16, React 19, Tailwind CSS 4, TanStack Query/Table/Virtual, Recharts, nuqs. Convex for the backend and database. Remeda for data transforms, Zod for validation at boundaries. Tooling is bun + Turborepo, with the [OXC](https://oxc.rs) toolchain (oxlint + oxfmt) in place of an ESLint/tsc stack.

## Public API

A preview HTTP API exposing curated model and endpoint data as JSON:

```
GET https://orca.orb.town/api/preview/v2/models
```

The web route rewrites to a Convex HTTP action (`packages/backend/convex/public_api/preview_v2.ts`). It's an explicit preview — the response shape may change. The `/api` page on the site documents the current response.

## Development

Requires [bun](https://bun.sh). The backend runs on [Convex](https://convex.dev).

```bash
bun install

bun run dev          # web + backend
bun run dev:next     # web only
bun run dev:backend  # Convex only
```

Linting and formatting use OXC and are fast enough to run repo-wide:

```bash
bun run fix     # oxlint + oxfmt, mutating
bun run check   # CI-equivalent, non-mutating
```

## Environment

- `ORCA_CRAWL_CRON_ENABLED` — set to `true` only in environments that should run the scheduled snapshot crawls. Unset by default, which keeps automatic crawls off (preview deployments included).

## Status

A personal project, actively maintained and running in production. The public API is a preview, so don't assume its shape is stable.
