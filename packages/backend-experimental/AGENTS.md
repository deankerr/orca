# Backend Redesign

This directory is a greenfield prototype for ORCA's next backend architecture.

- Do not import code from the existing backend.
- Do not use return validators.
- The focus is a clean and thoughfully designed core implementation, for rapid iteration.
- Out of scope: rigourous error handling (exceptions are valuable right now), testing.

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

Ingestion and storage of versioned, materialized MEP data: `catalog`.

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
