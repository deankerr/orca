# ORCA (OpenRouter Capability Analysis)

@docs/objectives.md

## Development

- Use `bun run fix` for all validation and formatting. Not `tsc`.
- Lint suppression requires an explanation: default to `// oxlint-disable-next-line rule -- Reason.`, or ordinary comments above.

## Overview

ORCA aggregates, analyzes, and visualizes AI model and provider data from OpenRouter. The system maintains a historical database that updates regularly, enabling users to discover models, track changes over time, and make data-driven selection decisions.

- `apps/web`: Next.js frontend
- `packages/backend`: Convex
- `apps/logos`: Asset service
- "MEPs" = Models, Endpoints, Providers

## Target Users

- Highly technical users who work with OpenRouter and LLMs professionally:
- Deep understanding of AI model concepts (context lengths, quantization, reasoning tokens)
- Want rapid and comprehensive endpoint comparisons
- Value technical precision and dense data over simplified summaries

## Products

- `apps/web/features/endpoints-data-grid/` Primary browsing interface - comprehensive, filterable data grid for comparing endpoints.

- `apps/web/features/monitor/` Change tracking feed showing field-level diffs between snapshots, revealing activity otherwise impossible to observe.

- `apps/web/features/pricing-history/` Per-model overlay of provider prices over time. Opened from Entity Overview or `?pricing-history=<modelId>`.

- `packages/backend/convex/alerts/` Users can subscribe to model id patterns, providing a personalized version of Monitor via Discord. No frontend component.

- `packages/backend/convex/public_api/v2/` Public HTTP API providing programmatic access to ORCA's curated data.
