# Backend Redesign

This directory is a greenfield prototype for ORCA's next backend architecture.

- Do not import code from the existing backend.
- Do not use return validators.
- The focus is a clean and thoughfully designed core implementation, for rapid iteration.
- Out of scope: rigourous error handling (exceptions are valuable right now), testing, metrics.

## Background

The current production pipeline is built around archived crawl bundles, later
materialization, and snapshot-to-snapshot diffing. This redesign explores a
different center of gravity:

- ingest raw endpoint observations directly
- append immutable versions only when content actually changes
- split high-churn/text heavy data from stable, core records

Most data never changes, some changes rarely - but we want to know this as soon as possible.

- the focus has moved towards increasing collections per hour
- periodic archival snapshots would give a sufficient level of change detail
- storing versioned entity records unlocks the historical perspectives that have so far been lacking

Observational data should be kept distinct from our materialized records.

- prevent frontend end-user query invalidation from routine background processes
- avoid "Everything Is OK" alarms - start from the basis that data is up-to-date
- detect anomolies in the background - is an entity we know about no longer present in the upstream data?

## Current Scope

Ingestion and storage of versioned, materialized MEP data: `catalog`.

Not yet modelled:

- archival storage
- formal collection orchestration, bookkeeping

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
