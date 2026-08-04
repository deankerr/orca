# ORCA (OpenRouter Capability Analysis)

## Active: New Architecture

- @notes/objectives.md is the primary statement of tangible objectives and product requirements.
- @notes/now.md current work
- @docs/openrouter reference when working directly with the data

## Vendored Repositories

This project vendors external repositories under @repos/

- Use vendored repositories as read-only reference material when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not import from @repos/ - application code should continue importing from normal package dependencies

## Effect V4 Beta

- Effect should be used in all newly written code.
- When writing Effect code, inspect @repos/effect/ for examples of idiomatic usage, tests, module structure, and API design. Treat it as the source of truth for Effect patterns.
- All Effect packages must use a unified, pinned version.
- Unstable packages `effect/unstable/*` may be used.

# Legacy Instructions

## OXC

- Always run `bun run fix` after you have completed your changes, to check and auto-fix errors where possible.
- Inline disables may be used with a short explanation to justify it.
- The script may change files that you didn't touch - this is acceptable and changes should be retained.

## Overview

ORCA aggregates, analyzes, and visualizes AI model and provider data from OpenRouter. The system maintains a historical database that updates regularly, enabling users to discover models, track changes over time, and make data-driven selection decisions.

- `apps/web`: Next.js 16, React 19, Tailwind CSS 4, TanStack Query/Table/Virtual
- `packages/backend`: Convex

## Target Users

Highly technical users who work with OpenRouter and LLMs professionally:

- Deep understanding of AI model concepts (context lengths, quantization, reasoning tokens)
- Need comprehensive pricing details and capability comparisons
- Value technical precision and dense data over simplified explanations

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

### Remeda

- Use remeda to write functional code that is compact as easy to read.
- Import with this conventinon: `import * as R from 'remeda` - full treeshaken, safe to use in the frontend and backend
- It is maintained by TKDodo, is battle-tested and has excellent type-safety
- Useful examples: `R.isDefined`, `R.isNullish`, `R.isNonNullish`, `R.chunk`, `R.pickBy`, `R.omitBy`, `R.countBy`

## Entity Logos

- `apps/logos`
- Builds and serves logo assets through a standalone Cloudflare Worker
- Shared slug-to-service-URL resolution lives in `packages/backend/shared/entity-logo.ts`
