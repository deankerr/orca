# ORCA (OpenRouter Capability Analysis)

## Commands

- `bun run check`: type check and lint the whole project - do not try to check components individually. This is all you need.

## Overview

ORCA aggregates, analyzes, and visualizes AI model and provider data from OpenRouter. The system maintains a historical database that updates regularly, enabling users to discover models, track changes over time, and make data-driven selection decisions.

- Package manager: bun
- Next.js 16, React 19, Tailwind CSS 4, TanStack Query/Table/Virtual
- Convex
- Styling: Dark theme, monospace fonts, dense layouts
- Production/preview deployments: Vercel

## Target Users

Highly technical users who work with OpenRouter and LLMs professionally:

- Deep understanding of AI model concepts (context lengths, quantization, reasoning tokens)
- Need comprehensive pricing details and capability comparisons
- Value technical precision over simplified explanations
- Will copy/paste values (model slugs, API parameters) directly into their code

## Major Features

### Endpoints Data Grid

Primary browsing interface - comprehensive, filterable data grid for comparing models and endpoints. Advanced filtering by capabilities, pricing, modalities, supported parameters. Ongoing evolution as OpenRouter's offerings expand.

- `app/` (home page)
- `components/endpoints-data-grid/`
- `components/data-grid/` ReUI Data Grid

### Monitor

Change tracking feed showing field-level diffs between snapshots. Reveals model/endpoint/provider activity that was previously impossible to observe.

- `app/monitor/`
- `components/monitor/`

### Discord Alerts Bot

Users can subscribe to model id patterns, providing a personalized version of Monitor via Discord. There is no frontend component.

- `convex/alerts/`
- `convex/discord/`

### ORCA API

Public HTTP API providing programmatic access to ORCA's curated data.

- `app/api/`
- `/api/preview/v2/models` endpoint
- `/public-api-preview/v2/models` backend endpoint
- `convex/public_api/preview_v2.ts`

## Architecture Overview

### Backend (`convex/`)

Serverless real-time database with Convex. Data pipeline transforms raw OpenRouter API responses into queryable views.

- `convex/snapshots/` - Data collection and processing pipeline
- `convex/db/` - Database queries and schema definitions
- `convex/analysis/` - Analytics and statistics processing (run via Convex dashboard)

- `convex/shared/` - Utilities imported by both frontend and backend
  - e.g. value formatters, logo data
  - Modules MUST import types only - do not pull our backend code into the frontend!

## Data Pipeline

```
OpenRouter API
    ↓
[Crawl] → Fetch models, endpoints, providers, analytics
    ↓
[Archive Bundle] → Gzip + store in Convex file storage
    ↓
[Materialize] → Validate, transform, denormalize into views
    ↓
[Views] → or_views_{endpoints, models, providers}
    ↓
[Change Detection] → Diff consecutive snapshots
    ↓
[Changes] → or_views_changes (field-level diffs)
```

### Backend Structure

**Snapshot Collection** (`convex/snapshots/crawl/`)

- Orchestrates API fetching from OpenRouter
- Fetches models, endpoints, providers, optional analytics
- Compresses as gzip bundle, stores in Convex file storage
- Records metadata in `snapshot_crawl_archives` table

**Materialization** (`convex/snapshots/materialize/`)

- Transforms raw bundles into normalized views
- Denormalizes data (flattens pricing, limits, capabilities)
- Upserts to `or_views_{endpoints, models, providers}` tables
- Sets `unavailable_at` timestamp when entities disappear

**Change Tracking** (`convex/snapshots/materializedChanges/`)

- Compares consecutive snapshots
- Computes field-level diffs with json-diff-ts
- Skips non-user-facing fields (stats, timestamps)
- Outputs to `or_views_changes` with create/update/delete types

**Database Queries** (`convex/db/`)

- `or/views/` - Queries for endpoints, models, providers, changes
- `snapshot/crawl/` - Archive and config management

## Key Concepts

### crawl_id

Timestamp string identifying a snapshot (sortable, parseable to Date). Uniquely identifies archive bundles.

### Derived State is Expendable

All views can be regenerated from archive bundles. This enables:

- Recovery by regeneration (rebuild from snapshots)
- Graceful degradation (partial failures don't cascade)
- Resilience to schema changes (reprocess historical data)

## Development Notes

### Logging

- The Convex backend is linked to Axiom, which captures all console.logs automatically
- We use an simple ad-hoc structured logging format, e.g. `console.log('[function] optional short message', { someData, otherData })`
- Optionally use `[function:subFunction]` only when necessary.
- A single Convex function can emit a total of 256 log messages, with any further being truncated - keep in mind during processing loops.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
