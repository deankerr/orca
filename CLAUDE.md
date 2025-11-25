# ORCA (OpenRouter Capability Analysis)

## Overview

ORCA aggregates, analyzes, and visualizes AI model and provider data from OpenRouter. The system maintains a historical database that updates regularly, enabling users to discover models, track changes over time, and make data-driven selection decisions.

## Target Users

Highly technical users who work with OpenRouter and LLMs professionally:

- Deep understanding of AI model concepts (context lengths, quantization, reasoning tokens)
- Need comprehensive pricing details and capability comparisons
- Value technical precision over simplified explanations
- Will copy/paste values (model slugs, API parameters) directly into their code

## Major Features

### Endpoints Data Grid

Primary browsing interface - comprehensive, filterable data grid for comparing models and endpoints. Advanced filtering by capabilities, pricing, modalities, supported parameters. Ongoing evolution as OpenRouter's offerings expand.

### Monitor

Change tracking feed showing field-level diffs between snapshots. Reveals model/endpoint/provider activity that was previously impossible to observe. Popular feature for visibility into the rapidly evolving AI landscape.

### Model Analytics Dashboard

Integration and visualization of OpenRouter's usage statistics. Tracks cumulative token counts, request volumes, and trends over time.

### Developer API

Public HTTP API providing programmatic access to ORCA's curated data. `/public-api-preview/v2/models` endpoint for model/endpoint listings, with planned expansion for changes feed and analytics.

## Architecture Overview

### Frontend (`app/`)

- Next.js 16 + React 19 + Tailwind CSS 4
- Routes: `/` (home), `/endpoints` (data grid), `/monitor` (changes feed)
- Dev tools: `/dev/*` (archives, stats, component demos)

### Backend (`convex/`)

Serverless real-time database with Convex. Data pipeline transforms raw OpenRouter API responses into queryable views.

**Key directories:**

- `convex/snapshots/` - Data collection and processing pipeline
- `convex/db/` - Database queries and schema definitions
- `convex/analysis/` - Analytics and statistics processing

### Components (`components/`)

- `endpoints-data-grid/` - Main data grid with filtering/sorting
- `monitor-feed/` - Change tracking visualization
- `data-grid/` - Reusable data grid framework (virtual scrolling, column management)
- `shared/` - Shared UI components
- `ui/` - shadcn/ui base components

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

- `main.ts` - Orchestrates API fetching from OpenRouter
- Fetches models, endpoints, providers, optional analytics
- Compresses as gzip bundle, stores in Convex file storage
- Records metadata in `snapshot_crawl_archives` table

**Materialization** (`convex/snapshots/materialize/`)

- `main.ts` - Transforms raw bundles into normalized views
- `validators/` - Zod schemas for strict validation
- Denormalizes data (flattens pricing, limits, capabilities)
- Upserts to `or_views_{endpoints, models, providers}` tables
- Sets `unavailable_at` timestamp when entities disappear

**Change Tracking** (`convex/snapshots/materializedChanges/`)

- `main.ts` - Compares consecutive snapshots
- `process.ts` - Computes field-level diffs with json-diff-ts
- Skips non-user-facing fields (stats, timestamps)
- Outputs to `or_views_changes` with create/update/delete types

**Statistics** (`convex/snapshots/stats/`)

- Processes OpenRouter analytics endpoint data
- Tracks token usage, request counts, tool calls per model
- Stores daily aggregated stats in `or_stats` table

**Database Queries** (`convex/db/`)

- `or/views/` - Queries for endpoints, models, providers, changes
- `snapshot/crawl/` - Archive and config management
- `or/stats.ts` - Analytics queries and aggregations

## Key Concepts

### crawl_id

Timestamp string identifying a snapshot (sortable, parseable to Date). Uniquely identifies archive bundles.

### Derived State is Expendable

All views can be regenerated from archive bundles. This enables:

- Recovery by regeneration (rebuild from snapshots)
- Graceful degradation (partial failures don't cascade)
- Resilience to schema changes (reprocess historical data)

### Temporal Awareness

Data has validity periods between snapshots. Entities can disappear and return. Historical state is reconstructable from any crawl_id.

## Development Notes

### Tech Stack

- Package manager: Bun
- Frontend: Next.js 16, React 19, Tailwind CSS 4
- Backend: Convex (serverless functions + real-time DB)
- Data grid: TanStack Table with virtualization
- Styling: Dark theme, monospace fonts, dense layouts

### Project Philosophy

- Solo development - no team ceremony
- Quick iteration over perfect planning
- Component labels for filtering, not bureaucracy
- Let the code speak for itself - minimal documentation

Active projects: Endpoints Data Grid, Monitor, Model Analytics Dashboard, Developer API

### Working with Live Data (Convex MCP)

**Use the Convex MCP tools frequently.** Schema definitions tell you structure, but real data tells the story.

**Available Tools:**

**`mcp__convex__data`** - Read paginated data from tables

- **When:** First step when working with any table
- **Why:** See actual record structure, not just schema
- Example: `limit: 5, order: desc` to see latest endpoints
- Use cases: Verify data shape, check field values, explore new modalities

**`mcp__convex__tables`** - Get complete schema overview

- **When:** Understanding database structure or checking indexes
- **Why:** See declared vs inferred schemas, index strategies
- Use cases: Planning queries, understanding relationships, checking field optionality

**`mcp__convex__runOneoffQuery`** - Execute ad-hoc queries

- **When:** Need custom filtering or analysis not available in queries
- **Why:** Sandboxed read-only exploration without writing functions
- Example: Find all endpoints with `video` input or `embeddings` output
- Use cases: Data exploration, validation, answering "how many X?" questions

**`mcp__convex__logs`** - View function execution logs

- **When:** After triggering actions (crawls, materializations)
- **Why:** See real-time pipeline execution, timing, and results
- Example: Check crawl totals, materialization counts, change detection
- Use cases: Debugging, understanding data flow, monitoring pipeline health

**`mcp__convex__functionSpec`** - List all available functions

- **When:** Exploring what queries/mutations are available
- **Why:** See function signatures, validators, visibility
- Use cases: Understanding API surface, finding the right query

**`mcp__convex__run`** - Execute specific functions

- **When:** Testing queries with real arguments
- **Why:** Validate function behavior before using in frontend

**Recommended workflow:**

1. **Schema first** - Use `tables` to understand structure
2. **Data second** - Use `data` to see 3-5 real records
3. **Query third** - Write code based on actual examples, not assumptions
4. **Validate fourth** - Use `runOneoffQuery` to test assumptions
5. **Monitor** - Check `logs` after pipeline runs to see what happened

**Key insight:** The Convex MCP gives you x-ray vision into the database. Use it liberally. Viewing real data reveals:

- How nested objects are actually structured (pricing with 12 optional fields)
- Which fields are commonly null vs always present
- Actual enum values (change_kind: create/update/delete)
- Real-world edge cases (1.84M context length models, free pricing tiers)
- Pipeline behavior (781 endpoints updated, but 0 user-facing changes)

### Logging

- The Convex backend is linked to Axiom, which captures all console.logs automatically
- We use an simple ad-hoc structured logging format, e.g. `console.log('[function] optional short message', { someData, otherData })`
- Optionally use `[function:subFunction]` only when necessary.
- A single convex function can log 256 times before an error message is generated reporting that further logs have been truncated.

## Getting Oriented

**Want to understand:**

- Data pipeline? → `convex/snapshots/` (crawl → materialize → changes)
- Database schema? → `convex/schema.ts` + `convex/db/`
- Main UI? → `app/endpoints/page.tsx` + `components/endpoints-data-grid/`
- Change tracking? → `convex/snapshots/materializedChanges/` + `components/monitor-feed/`
- HTTP API? → `convex/http.ts` (preview implementation)

Let the file structure guide you. The organization reflects the data flow and feature boundaries.
