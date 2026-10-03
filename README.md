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
- **Discord alerts** — entity events rendered to a single webhook target. (`packages/backend/convex/alerts/discord/`)
- **Public API** — an HTTP endpoint exposing the curated model/endpoint data. See [Public API](#public-api) below.

It's aimed at people who work with OpenRouter and LLMs directly — the kind of user who reads context lengths, quantization, and reasoning-token support closely and copies model slugs straight into their code. The presentation favors technical precision over simplification.

## Architecture

Turborepo monorepo. Next.js frontend on Vercel; Convex backend handling storage, scheduling, scan ingestion, change tracking, and the public API.

| Workspace          | Role                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `apps/logos`       | Cloudflare Worker serving generated provider and model logo assets                           |
| `apps/web`         | Next.js 16 / React 19 frontend — data grid, monitor, overviews, pricing history, API docs    |
| `packages/backend` | Convex backend — schema, crons, scan ingestion, change tracking, Discord webhook, public API |

## Documentation

- [Domain vocabulary](CONTEXT.md): identity, observations, listings, and ingestion.
- [Development data](docs/orca/development-data.md): populate a dev deployment and connect the web app.
- [Provider identity](docs/orca/provider-identity.md), [pricing policy](docs/orca/pricing.md), and [Pricing History](docs/orca/pricing-history.md).
- [Events and alerts](docs/orca/events.md), [Feed contract](docs/orca/feed.md), and [Discord operations](docs/orca/discord.md).
- [OpenRouter catalog](docs/openrouter/catalog.md) and [pricing](docs/openrouter/pricing.md): upstream research, separate from ORCA policy.

## Public API

A preview HTTP API exposing curated model and endpoint data as JSON:

```
GET https://orca.orb.town/api/preview/v2/models
```

The web route rewrites to the cached Convex HTTP action (`packages/backend/convex/public_api/v2/`). Its V2 response contract is frozen for compatibility. The `/api` page on the site documents the current response.

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
