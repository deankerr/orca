# ORCA (OpenRouter Capability Analysis)

## Development

- Use `bun run fix` for all work validation, including type checking. Do not use `tsc`.
- Inline linter disables may be used if the reasoning is justified.

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

- `packages/backend/convex/public_api/v2/`

## Entity Logos

- `apps/logos`
- Builds and serves logo assets through a standalone Cloudflare Worker
- Shared slug-to-service-URL resolution lives in `packages/backend/convex/shared/entityLogo.ts`
