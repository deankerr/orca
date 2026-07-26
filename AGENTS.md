# ORCA (OpenRouter Capability Analysis)

## Active: data architecture rework

We are replacing the Convex-centric snapshot pipeline with a layered artifact system.
The existing Convex pipeline keeps running and is a guide, not a migration constraint.

- Design notes: `notes/data-architecture/`
- Alchemy should be used to scaffold Cloudflare projects.
- Effect should be used in all newly written code.
  - I am new to Effect so make code extra neat and well documented.

### Schemas and validation

- **effect Schema is the validation system for new work**, and shapes live in `packages/schema`
  (`@orca/schema`), not inside the app that happens to need them first. Import as
  `import * as Schema from 'effect/Schema'`.
- Each schema is exported next to the function that produces it, so a field's whole journey is in
  one file.
- Put `// oxlint-disable sort-keys` at the top of a schema file: properties are grouped
  semantically and, for stored rows, declaration order **is** column order.

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
