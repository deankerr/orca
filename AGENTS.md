# ORCA (OpenRouter Capability Analysis)

## OXC

- Run `bun run fix` at the repo root after edits in almost all cases.
- `fix` is fast: it uses `oxlint`, `oxlint-tsgolint`, and `oxfmt`, not a slow ESLint/tsc stack.
- Prefer root-wide `fix` over targeted checks so monorepo-wide issues are caught.
- Use `bun run check` when you specifically need CI-equivalent, non-mutating verification.

## Overview

ORCA aggregates, analyzes, and visualizes AI model and provider data from OpenRouter. The system maintains a historical database that updates regularly, enabling users to discover models, track changes over time, and make data-driven selection decisions.

- Package manager: bun
- Next.js 16, React 19, Tailwind CSS 4, TanStack Query/Table/Virtual
- Convex
- Production/preview deployments: Vercel

## Target Users

Highly technical users who work with OpenRouter and LLMs professionally:

- Deep understanding of AI model concepts (context lengths, quantization, reasoning tokens)
- Need comprehensive pricing details and capability comparisons
- Value technical precision over simplified explanations
- Will copy/paste values (model slugs, API parameters) directly into their code

### Endpoints Data Grid

Primary browsing interface - comprehensive, filterable data grid for comparing models and endpoints. Advanced filtering by capabilities, pricing, modalities, supported parameters. Ongoing evolution as OpenRouter's offerings expand.

- `apps/web/components/endpoints-data-grid/`

### Monitor

Change tracking feed showing field-level diffs between snapshots. Reveals model/endpoint/provider activity that was previously impossible to observe.

- `apps/web/components/monitor/`

### Discord Alerts Bot

Users can subscribe to model id patterns, providing a personalized version of Monitor via Discord. There is no frontend component.

- `packages/backend/convex/alerts/`
- `packages/backend/convex/discord/`

### ORCA API

Public HTTP API providing programmatic access to ORCA's curated data.

- `packages/backend/convex/public_api/preview_v2.ts`

### crawl_id

Timestamp string identifying a snapshot (sortable, parseable to Date). Uniquely identifies archive bundles.

### Remeda

- Use remeda to write functional code that is compact as easy to read.
- Import with this conventinon: `import * as R from 'remeda` - full treeshaken, safe to use in the frontend and backend
- It is maintained by TKDodo, is battle-tested and has excellent type-safety
- Useful examples: `R.isDefined`, `R.isNullish`, `R.isNonNullish`, `R.chunk`, `R.pickBy`, `R.omitBy`, `R.countBy`

### Deployment

- `apps/web` Vercel production and preview environments

## Backend Rewrite

- `packages/backend-experimental`
- Greenfield re-implementation, no production deployment.

## Entity Logos

- `packages/entity-logos`
- Collects logo assets from multiple sources
- Resolves entity slugs at runtime for backend and frontend
