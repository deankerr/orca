# Backend Redesign

This directory is a greenfield prototype for ORCA's next backend architecture.

- Do not share code or import from any other package.
- Do not use return validators.

## Background

The current production pipeline is built around archived crawl bundles, later
materialization, and snapshot-to-snapshot diffing. This redesign explores a
different center of gravity:

- ingest raw endpoint observations directly
- append immutable versions only when content actually changes
- split high-churn pricing history from lower-churn endpoint state
- keep explicit provenance back to the raw source bundle

## Core Idea

The new model is:

1. Observe raw endpoint data.
2. Validate and normalize it into canonical shapes.
3. Split it into independent state streams.
4. Compare each stream against its current catalog version row.
5. Insert a new immutable state row only when that stream changed.

This keeps the historical record at the entity level rather than forcing us to
replay whole archives to reconstruct change history.

## Current Scope

Right now the redesign is focused only on model endpoints.

The main catalog tables are:

- `catalog_endpoints`
  - Core endpoint state: model/provider identity, context, quantization,
    supported parameters, capabilities, flags, limits, and data policy.
- `catalog_endpoint_pricing`
  - Pricing-only history: text/audio/image/request pricing, cache pricing,
    reasoning pricing, discounts.
- `catalog_versions`
  - Shared catalog version header used to detect whether a canonical payload has
    changed, assign the next row version, and hold provenance metadata.

This split is intentional. Pricing changes much more often than the rest of an
endpoint record, so it should not force a full endpoint rewrite every time.

## How Versioning Works

Each endpoint has two independent streams:

- base stream: `catalog_endpoints`
- pricing stream: `catalog_endpoint_pricing`

Each stream is keyed by endpoint UUID and uses an append-only `version`
number. A catalog row also stores:

- `first_seen_at`
  - When this distinct state was first observed.
- `version_id`
  - Reference to the matching `catalog_versions` row for this state.

Version rows hold the shared provenance and hash metadata for a state:

- `scope_table`
- `id`
- `first_seen_at`
- `version`
- `content_hash`
- `source`

The catalog rows remain the source of truth for payload reads. Query-side
current-state reads are derived from those streams using latest-per-entity
scans over `first_seen_at`.
