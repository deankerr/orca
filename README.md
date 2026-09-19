# ORCA

OpenRouter Capability Analysis — aggregates, analyzes, and visualizes AI model and provider data from [OpenRouter](https://openrouter.ai).

Live at [orca.orb.town](https://orca.orb.town).

## What it does

OpenRouter's catalog of models, providers, and endpoints changes constantly — pricing moves, endpoints appear and disappear, capabilities shift — and there's no built-in way to observe that history or compare offerings in depth. ORCA captures OpenRouter observations as durable scan artifacts and derives current catalog views, historical series, and change events from them.

That history powers a few things:

- **Endpoints Data Grid** — the primary browsing interface. A dense, filterable grid for comparing models and endpoints across capabilities, pricing, modalities, and supported parameters. Built on TanStack Table and Virtual to stay responsive over the full catalog. (`apps/web/features/endpoints-data-grid/`)
- **Monitor** — a change feed showing field-level diffs between snapshots, surfacing model, endpoint, and provider activity that is otherwise invisible. (`apps/web/features/monitor/`)
- **Entity Overview** — a sheet with model or provider details, opened from the grid and Monitor. (`apps/web/features/entity-overview/`)
- **Pricing History** — a per-model overlay of provider prices over time. (`apps/web/features/pricing-history/`)
- **Discord alerts (legacy)** — production-only subscriptions to model id patterns. This integration is deprecated and is not provisioned for development or previews. (`packages/backend/convex/alerts/`, `packages/backend/convex/discord/`)
- **Public API** — an HTTP endpoint exposing the curated model/endpoint data. See [Public API](#public-api) below.

It's aimed at people who work with OpenRouter and LLMs directly — the kind of user who reads context lengths, quantization, and reasoning-token support closely and copies model slugs straight into their code. The presentation favors technical precision over simplification.

## Architecture

Turborepo monorepo. Next.js frontend on Vercel; Convex backend handling storage, scheduling, scan ingestion, change tracking, and the public API.

| Workspace          | Role                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `apps/logos`       | Cloudflare Worker serving generated provider and model logo assets                          |
| `apps/web`         | Next.js 16 / React 19 frontend — data grid, monitor, overviews, pricing history, API docs   |
| `packages/backend` | Convex backend — schema, crons, snapshot pipeline, change tracking, Discord bot, public API |

### Data pipeline

1. **Capture** — scheduled scans preserve upstream observations as durable artifacts in Convex storage or R2.
2. **Project** — V3 ingestion derives current models, endpoints, and providers plus listing, pricing, and stats series. These power the catalog, entity overview, and pricing history.
3. **Interpret changes** — a separate change-event pipeline compares scan artifacts and retains entity-change history independently of view ingestion.

Migration is ongoing: Monitor, Discord alerts, and the V2 public API still use legacy snapshot-derived tables. See [V3](packages/backend/convex/v3/README.md) and [Change events](packages/backend/convex/changeEvents/README.md) for the current pipeline.

### Stack

TypeScript throughout. Next.js 16, React 19, Tailwind CSS 4, TanStack Query/Table/Virtual, ECharts, nuqs. Convex for the backend and database. Remeda for data transforms, Zod for validation at boundaries. Tooling is Bun + Turborepo, with the [OXC](https://oxc.rs) toolchain (oxlint + oxfmt) in place of an ESLint/tsc stack.

## Public API

A preview HTTP API exposing curated model and endpoint data as JSON:

```
GET https://orca.orb.town/api/preview/v2/models
```

The web route rewrites to the cached Convex HTTP action (`packages/backend/convex/public_api/v2/`). It's an explicit preview — the response shape may change. The `/api` page on the site documents the current response.

## Development

Requires [Bun](https://bun.sh), Node.js 24+, and a global [Portless](https://github.com/vercel-labs/portless) installation. The backend runs on [Convex](https://convex.dev).

```bash
bun install --frozen-lockfile

bun run dev          # web + backend
bun run dev:web      # web only, through Portless
bun run dev:backend  # Convex only
```

Linting and formatting use OXC and are fast enough to run repo-wide:

```bash
bun run fix     # oxlint + oxfmt, mutating
bun run check   # non-mutating lint/format check
```

## Environment

Backend environment variables are documented alongside their validators in [`convex.config.ts`](packages/backend/convex/convex.config.ts).
