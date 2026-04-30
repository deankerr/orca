# Backend Experimental

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

## Feature Structure

Code is organised into top level _directories_ with the name of the _feature_, e.g. `catalog`, `collection`. Top level _files_ export the stable Convex API surface, delegating implementation details to the relevant feature.

- Use `define{Query|Mutation|Action}Spec` to create a validator/handler combo which can be called internally with `func.handler`, and dropped directly into a Convex Function, e.g. `export const list = query(func)`.
- Features may export a curated API as a namespaced object from `index.ts`, keeping implementation details private.
  - Exception: Convex table definitions should be imported directly by the root `schema.ts` to prevent load order issues during codegen.
- Internal background process workflows are not considered part of the Convex API surface.

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

## Status

- Experimental adoption of backend-experimental for endpoints data grid
- additional model page
- expanded stats tracking

### Known Issues

- Collection parsers may validate unused fields (desired fields are not finalized)

### Deferred

- archival storage
- collection orchestration
- monitor/changes features
