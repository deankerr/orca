# Catalog Design

Date: 2026-04-21

## Purpose

`Catalog` is ORCA's durable store of versioned entity knowledge.

Its job is to:

- preserve ORCA's time-aware understanding of incoming data
- support efficient default reads for application surfaces
- support exact historical reads for one entity over time
- represent availability changes without cloning content

This document defines the core catalog mechanisms only.

It intentionally does not describe:

- file structure
- collection orchestration
- transformation details
- upstream-specific behavior

For the purposes of this design, data simply arrives from outside the catalog.

## Design goals

- Keep catalog-visible history append-only.
- Keep incoming-data bookkeeping outside the catalog.
- Allow independent versioning of entity components.
- Preserve exact historical entity states, not reconstructed approximations.
- Support default queries that can filter by availability windows.
- Keep the model generic so it applies uniformly across entity types.

## Core principles

### 1. Catalog state is ORCA-owned

The catalog stores ORCA's understanding of an entity, not a verbatim copy of incoming data.

That means the catalog is allowed to model concepts that do not exist directly in upstream data, such as:

- availability over time
- exact pairings of component versions
- temporal entity history

### 2. Incoming-data bookkeeping is not catalog data

The system that determines whether an entity should be marked unavailable may read catalog data at any time, but its bookkeeping must stay outside the catalog.

Routine facts such as:

- last checked time
- last seen during a successful reconciliation
- reconciliation counters
- completeness markers

must not invalidate catalog reads.

Only decisive catalog-visible changes are written to the catalog.

### 3. Content history and entity history are different concerns

A content change and a state change are not the same thing.

Component content may change independently.
Availability may change without any content change.

The catalog must represent both without forcing either one into the other's storage model.

### 4. Historical reads must be exact

The catalog should not depend on reconstructing historical entity states from timestamps alone.

If a historical entity state matters, the catalog should store the exact component-version pairing that was true at that point in time.

## Catalog concepts

### Catalog Entity

A `Catalog Entity` is a durable thing tracked by the catalog.

The catalog design is generic at this level. It does not depend on the domain-specific meaning of any one entity type.

### Component

A `Component` is a distinct opaque part of a Catalog Entity whose content can change independently.

An entity may have one or more Components.

### Component Version

A `Component Version` is a versioned content change for one Component of one Catalog Entity.

`version` in storage should be understood as shorthand for `version_number`.

### Entity State

An `Entity State` is ORCA's time-aware understanding of a Catalog Entity at one point in history.

Entity State includes:

- availability
- the pairing of Component Versions that belong together at that time
- the content fingerprints for the paired Component Versions

### Pairing

A `Pairing` is the set of Component Versions associated with one Entity State.

This pairing is explicit.

It is the mechanism that makes historical reads exact.

## Storage model

Each entity type gets:

- one `Entity State Table`
- one or more `Component Tables`

### Entity State Table

The Entity State Table is append-only.

Each `Entity State Row` records:

- entity identity
- a monotonically increasing `version` number
- when this state was first observed by the catalog
- availability
- the pairing of Component Versions for that state
- the content hashes for the paired Component Versions

The row is the stored record.
The Entity State is the concept represented by that row.

The content hashes allow ingestion to compare incoming component content against the stored Entity State without hydrating the full Component Rows.

### Component Table

Each Component Table is append-only.

Each row records:

- entity identity
- a monotonically increasing `version` number
- when this component version was first observed by the catalog
- the content hash for the stored content
- normalized component content

Component Tables store content history only.

They do not store availability.

## Availability model

Availability is a property of Entity State, not of Component Content.

It is represented as a sparse property:

- `unavailableAt`

Semantics:

- `unavailableAt = undefined`
  - the entity is available in this Entity State
- `unavailableAt = timestamp`
  - the entity is unavailable from that time onward in this Entity State

This allows:

- availability changes without new Component Versions
- reappearance without cloning content
- default queries that include recently unavailable entities

## Write model

Incoming data is processed outside the catalog and may result in catalog writes.

The catalog only needs the following contract:

1. Incoming data may produce zero or more new Component Versions.
2. Incoming data may produce a new Entity State.
3. If neither component content nor availability changed in a catalog-visible way, the catalog remains unchanged.

An Entity State Row is written when at least one of the following is true:

- a paired Component Version changed
- availability changed
- the entity appeared for the first time

This means an availability-only transition can write a new Entity State Row that references the same Component Versions as the previous state.

This also means a content change can write:

- one or more new Component Versions
- one new Entity State Row that records the new pairing

## Read model

The catalog supports two primary read shapes.

### Default query

A Default query returns the most recent Projection for one or more Catalog Entities.

It should:

- read the most recent Entity State Row per entity
- apply any availability-window filter
- fetch the paired Component Versions
- assemble the Projection

### History query

A History query returns Entity States over time for one Catalog Entity.

It should:

- read Entity State Rows for the entity in descending version or time order
- optionally hydrate each state with its paired Component Versions

This yields exact historical reads because pairing is stored explicitly in the Entity State Row.

## Naming patterns

Catalog entity modules are scoped to one entity type.

Inside an entity module:

- do not repeat the entity name in function, argument, variable, or local type names
- use names such as `state`, `core`, `pricing`, `hydrate`, `getState`, `stateTable`, and `coreTable`
- reserve concrete entity names for actual database table names, public routing boundaries, and useful error messages

Default query and mutation names should not include `current` or `latest`.

The catalog's default read surface is always the most recent data unless a query explicitly says otherwise.

Examples:

- use `get` instead of `getCurrent`
- use `list` instead of `listLatest`
- use `getState` instead of `getCurrentState`
- use `history` when reading historical Entity States

Relationship selectors may name the related domain concept when it adds meaning, such as `listStatesByModel`.

## Availability window

The catalog supports an `Availability window` rather than a simple available/unavailable split.

This means a Default query may include:

- available entities
- entities that became unavailable recently

This is a first-class read concern of the catalog.

It is not an afterthought layered on top of content history.

## Example timeline

An entity with two Components can evolve like this:

```text
state v1 -> available, components: core 1 + pricing 1
state v2 -> available, components: core 1 + pricing 2
state v3 -> unavailable, components: core 1 + pricing 2
state v4 -> available, components: core 1 + pricing 2
state v5 -> available, components: core 2 + pricing 3
```

This expresses:

- content changes
- unavailable transitions
- reappearance without new content

without cloning any Component Content.

## Why this model

This design deliberately avoids several weaker alternatives.

### Not a single mutable state row

A mutable row cannot preserve exact historical Entity States.

### Not content cloning for availability

Availability is not content.

Cloning content rows to represent unavailable states pollutes content history with non-content changes.

### Not timestamp-only historical reconstruction

Reconstructing pairings from timestamps alone makes exact history implicit and fragile.

The catalog should store the pairing explicitly.

### Not catalog-visible bookkeeping

Routine reconciliation metadata would cause unnecessary query invalidation and blur the boundary between catalog state and detection mechanics.

## Non-goals

This design does not define:

- how incoming data is fetched
- how incoming data is normalized
- how detection chooses to mark something unavailable
- a domain-specific glossary for any concrete entity type

Those concerns matter, but they are outside the scope of the core catalog design.

## Result

The result is a catalog with two complementary histories:

- Component Version history
  - how content parts changed
- Entity State history
  - how the entity as a whole changed over time

That split is the core mechanism that makes the catalog both precise and practical:

- precise enough for exact history
- practical enough for efficient default reads
- generic enough to apply across entity types
