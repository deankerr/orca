# Convex Feature Organisation Design

This note is a living design document for reorganising `convex/` around durable feature modules.

We are using it to capture the structure we want, the structure we have already adopted, and the design questions that still deserve attention as we continue the refactor.

## Purpose

- Organise the Convex backend around durable product and domain concepts.
- Encapsulate upstream schema drift handling in dedicated ingestion layers.
- Keep public Convex query names stable and easy to locate.
- Define clear ownership for stored entity tables, app-facing projections, and shared query logic.
- Record the design decisions we make as the code evolves.

## Durable Feature Modules

The feature modules that currently look durable are:

- `catalog`
  Owns the stored entity views for models, providers, and endpoints, along with their app-facing projections and shared read helpers.
- `ingestion`
  Owns crawl, archives, upstream adaptation, canonicalisation, and materialisation into stored views.
- `changes`
  Owns change detection, enriched change records, and change-oriented read helpers.
- `monitor`
  Owns monitor-facing query surfaces over change history.
- `alerts`
  Owns subscriptions, matching, and dispatch planning.
- `integrations/discord`
  Owns Discord command handling, transport, and delivery behavior.
- `public_api`
  Owns public HTTP contracts and API-specific output shapes.
- `analysis`
  Owns on-demand exploratory and operational analysis queries.
- `platform`
  Owns generic Convex helpers and infrastructure utilities.

## Top-Level Convex Shape

Convex convention-driven files remain at the top level:

```text
convex/
  schema.ts
  http.ts
  crons.ts

  endpoints.ts
  models.ts
  providers.ts
  monitor.ts
  changeBatch.ts
```

These files provide the stable public query names that the app and clients use:

- `api.endpoints.list`
- `api.endpoints.getByUuid`
- `api.models.list`
- `api.models.getBySlug`
- `api.providers.list`
- `api.providers.getBySlug`

They act as the registration layer for Convex functions and delegate to feature-owned handlers.

## Catalog Pattern

`catalog` is the read-model home for the core ORCA entities:

```text
convex/
  catalog/
    shared/
      availability.ts

    models/
      index.ts
      projection.ts
      queries.ts
      table.ts

    providers/
      index.ts
      projection.ts
      queries.ts
      table.ts

    endpoints/
      index.ts
      projection.ts
      queries.ts
      table.ts
```

Each entity submodule has a clear role:

- `table.ts`
  Defines the stored Convex table schema for that entity.
- `projection.ts`
  Defines the app-facing projection built from the stored table row and exports the inferred projection type.
- `queries.ts`
  Defines read helpers and colocated validators for query args.
- `index.ts`
  Exports the feature surface that other backend modules consume.

## Catalog Module Responsibilities

The catalog layer owns:

- the stored table definition for each catalog entity
- the app-facing projection used by most of the application
- read helpers that return projected entity shapes
- small shared concerns that are genuinely common across catalog entities

This gives each entity module a single home for the concept of that entity in ORCA.

## Projection Layers

ORCA currently has two projection layers with different roles:

- ingestion projection
  Shapes upstream and canonicalised data into the stored `or_views_*` tables.
- catalog projection
  Shapes stored `or_views_*` rows into the entity shape used across the app.

This distinction keeps ingestion concerns and app-facing read concerns clearly separated.

## Query Helper Pattern

Catalog query helpers follow a consistent pattern:

- validators are defined beside the helper that uses them
- helper args are inferred directly from the validator
- helpers accept a single `args` object
- helpers can be used directly as Convex query handlers

This keeps the query surface compact and makes the handler contract obvious at the call site.

## Table Ownership

The table definition lives with the entity submodule in `catalog`.

That keeps the schema, projection, and read behavior for each entity co-located with the main place where the entity is defined. `schema.ts` can then import the tables directly from those feature modules.

## Shared Catalog Concerns

`catalog/shared/availability.ts` currently provides the availability fields and availability-window filtering used across catalog entities.

Shared catalog modules work best when they hold one clearly reusable concern with direct value across multiple entities.

## Schema Pattern

`schema.ts` imports feature-owned table definitions directly.

This keeps table ownership with the feature module and keeps the root schema file focused on composing the application's tables into one Convex schema.

## Current Progress

The current catalog shape is active for models, providers, and endpoints.

Implemented:

- `catalog/models`
- `catalog/providers`
- `catalog/endpoints`
- direct table definitions with native Convex validators
- projection modules for each entity
- query helpers with colocated arg validators
- `index.ts` entrypoints for each entity submodule
- shared availability handling
- public model, provider, and endpoint Convex queries wired to catalog helpers

This means the catalog pattern now exists as live backend code rather than a hypothetical target.

## Current Catalog Surface

The current `index.ts` entrypoint for each entity exports:

- the projection type
- the public read helpers
- the arg validators used by those helpers
- the table definition

That surface gives schema composition, query registration, and backend consumers one stable import point per catalog entity.

## Design Areas In Focus

The areas that still deserve ongoing design attention are:

- the broader `changes` module shape and its app-facing types
- the ingestion module shape, especially around upstream adapters and canonical entities
- the long-term structure of `public_api`
- the role and size of `catalog/shared`
- the point at which versioned table or adapter modules become useful enough to introduce

## Working Style

This document tracks an active human-LLM design process.

We are using code changes, validation, snapshots, and live backend behavior to expose the real details of the system as we reorganise it. The document exists to capture those decisions as they become clear in the codebase.

## Status

As an initial step, we are first focusing on dismantling the `db` directory, relocating or replacing tables, removing the vTable helper, and no longer co-locating query helper functions with schemas - while avoiding major changes to background processes like `snapshots` and Discord alerts, and public APIs. Breaking this coupling will prepare for upcoming larger process refactors, while realising immediate benefits from co-location.
