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

## Module Kinds

We should treat the directories under `convex/` primarily as backend modules.

`module` is the most useful general term because it stays neutral about implementation details and works for both domain areas and process areas.

Within that broad category, several more specific module kinds already seem to be emerging:

- `entity module`
  Owns a durable domain object and its app-facing shape.
  Current examples include `catalog/models`, `catalog/providers`, and `catalog/endpoints`.
  `alerts/subscriptions` likely belongs here after refactoring.
- `event module`
  Owns historical records or event-like data whose subject is an entity rather than being an entity itself.
  `changes` currently fits this shape more than it fits an entity-module shape.
- `workflow module`
  Owns multi-step background processes and operational orchestration.
  Current examples include crawl, materialization, and dispatch flows.
- `integration module`
  Owns communication with an external system or external contract.
  Current examples include Discord and the public API.
- `platform module`
  Owns generic backend helpers, utilities, and reusable Convex infrastructure.

These names do not need to be enforced rigidly, but they provide better language for reasoning about responsibility and module boundaries.

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

## Module Surface Sketch

We should start to think of each module `index.ts` as a manifest or facade, not just as a barrel file.

In this backend, the purpose of `index.ts` is not bundler convenience. The purpose is to define the stable surface of the module.

That surface should be:

- deliberate rather than accidental
- easy to consume without understanding the module internals
- compact enough that humans and agents can discover the main capabilities quickly
- flexible enough that the internals can continue evolving behind it

This suggests a pattern where `index.ts` curates a stable module interface rather than forwarding everything from sibling files.

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

## Entity Module Interface Sketch

The current direction for entity modules is:

- internal query helpers can use short standardized verbs like `get` and `list`
- the selector detail belongs in the args object, not necessarily in the function name
- the module manifest should expose an interface object with a clear surface
- schema composition concerns can remain available separately

An example shape for `catalog/models` could look like:

```ts
export const models = {
  list,
  get,
  descriptions: {
    get: getDescription,
  },
} as const

export const modelsSchema = {
  table: modelsTable,
  descriptionTable: modelDescriptionsTable,
} as const
```

This gives two distinct surfaces:

- `models`
  The primary interface for backend consumers.
- `modelsSchema`
  The schema-facing and infrastructure-facing exports.

This would let consumers write code like:

```ts
import { models } from '@/convex/catalog/models'

const model = await models.get.handler(ctx, { slug })
```

while top-level Convex registration files can still provide explicit public API names:

```ts
import { models } from './catalog/models'

export const list = query(models.list)
export const getBySlug = query(models.get)
```

This keeps the public API explicit, while keeping the internal module surface compact and standardized.

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
- helper names inside an entity module can be standardized around compact verbs like `get` and `list`

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

The current `index.ts` entrypoint for each entity is evolving from a simple re-export file toward a more deliberate module manifest.

The intended longer-term direction is:

- export a compact interface object for ordinary backend consumers
- export schema-related elements separately for schema composition and infrastructure usage
- avoid requiring consumers to understand internal file layout just to use the module

This should make each entity module easier to consume as a stable backend component even while the internal organization continues evolving.

## Naming Direction

Some terminology seems worth establishing early:

- use `module` as the default word for top-level backend areas and durable sub-areas
- use `surface` for the stable exported interface of a module
- use `entity` for durable domain objects like models, providers, endpoints, and likely subscriptions
- use `event` or `change record` for historical records whose subject is an entity

This distinction matters because not every module should be forced into the same mental model.

For example:

- models, providers, endpoints, subscriptions
  naturally read as entities
- changes
  reads more naturally as an event-oriented module whose records reference entities

Keeping that distinction sharp should help us design clearer interfaces and avoid muddy naming as the backend grows.

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
