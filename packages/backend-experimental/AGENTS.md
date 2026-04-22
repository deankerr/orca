# Backend Redesign

This directory is a greenfield prototype for ORCA's next backend architecture.

- Create clean, straight-forward, and thoughtfully designed core implementations.
- Review and iterate all features frequently - **nothing** is set in stone.
- Do not use return validators.
- Do not import code from the existing backend.

## Observability

We use the Convex to Axiom log drain connector, which is configured in the Convex dashboard and not visible in project code.

- Runtime metrics with function names are captured for every execution, including on any `console.{log|warn|error}` or uncaught exception.
- Use `ConvexError` to throw errors with relevant domain data and a concise `message`.
- Minimize error boundaries - exceptions are valuable during development, and will roll back mutations if uncaught.

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
