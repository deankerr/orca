# Catalog Architecture

Read `catalog-glossary.md` first. This document relies on those terms and avoids repeating pure definitions unless a nuance or invariant matters.

## Purpose

`Catalog` is ORCA's durable store of versioned entity knowledge.

Its job is to:

- preserve ORCA's time-aware understanding of entity data
- support efficient default reads for application surfaces
- support exact historical reads for one entity over time
- represent availability changes without cloning content

This document describes the core Catalog architecture only.

It intentionally does not describe:

- transformation details
- external-source-specific behavior
- domain-specific entity meaning

Data arrives at the Catalog boundary already shaped as Catalog Entity and Component Content.

## Design Goals

- Keep Catalog-visible history append-only.
- Allow independent versioning of entity Components.
- Preserve exact historical Entity States, not reconstructed approximations.
- Support default queries that can filter by Availability windows.
- Keep entity functionality symmetrical unless there is a deliberate domain reason not to.
- Keep the model generic so it applies uniformly across entity types.

## Core Invariants

### Catalog State Is ORCA-Owned

The Catalog stores ORCA's understanding of an entity, not a verbatim copy of external data.

That means the Catalog may model concepts that do not exist directly in incoming data, such as:

- Availability over time
- exact Pairings of Component Versions
- temporal Entity State history

### Current Is The Default Read State

The default state of Catalog data is **Current**: the most recent Entity State and its paired Component Versions.

This is why default query names are simple names such as `get` and `list` rather than `getCurrent`, `getLatest`, `listCurrent`, or `listLatest`.

Historical access must be explicit through a specific `history` query.

### Content History And Entity History Are Different Concerns

A content change and an Entity State change are not the same thing.

Component Content may change independently.
Availability may change without any content change.

The Catalog must represent both without forcing either one into the other's storage model.

### Historical Reads Must Be Exact

The Catalog should not depend on reconstructing historical Entity States from timestamps alone.

If a historical Entity State matters, the Catalog stores the exact Component Version Pairing that was true at that point in time.

### Rows Are Storage, Not Meaning

A Row is the physical stored unit in a Catalog table.

Higher-level concepts such as Entity State, Component Version, and Projection are represented by Rows, but they are not interchangeable with Rows in language or design.

## Storage Model

Each entity type has:

- one Entity State Table
- one or more Component Tables

### Entity State Table

The Entity State Table is append-only.

Each Entity State Row records:

- entity identity
- a monotonically increasing Version number for Entity State history
- when this Entity State was first observed by the Catalog
- Availability
- the Pairing of Component Versions for that Entity State
- the content hashes for the paired Component Versions

The content hashes are part of Entity State so incoming Component Content can be compared against the stored state without hydrating full Component Rows.

### Component Tables

Component Tables are append-only.

Each Component Row records:

- entity identity
- a monotonically increasing Version number for that Component history
- when this Component Version was first observed by the Catalog
- the content hash for the stored content
- normalized Component Content

Component Tables store content history only.

They do not store Availability.

## Availability Model

Availability is a property of Entity State, not Component Content.

It is represented as a sparse property:

- `unavailableAt`

Semantics:

- `unavailableAt = undefined` means the entity is available in this Entity State.
- `unavailableAt = timestamp` means the entity is unavailable from that time onward in this Entity State.

This allows:

- Availability changes without new Component Versions
- reappearance without cloning content
- Default queries that include recently unavailable entities

## Write Model

A Catalog write may append zero or more Component Rows and zero or one Entity State Row.

Incoming entity data implicitly means the Catalog Entity is available.

The main incoming-data path should always write the next Entity State with `unavailableAt = undefined`.

Entities are declared unavailable by an explicit process that is separate from the incoming-data path.

An Entity State Row is appended when at least one of the following is true:

- a paired Component Version changed
- Availability changed
- the entity appeared for the first time

An Availability-only transition appends a new Entity State Row that references the same Component Versions as the previous Entity State.

A content change appends one or more Component Rows and one Entity State Row recording the new Pairing.

If neither Component Content nor Availability changed in a Catalog-visible way, the Catalog remains unchanged.

## Read Model

The Catalog supports two primary read shapes.

### Default Query

A Default query returns the Current Projection for one or more Catalog Entities.

It should:

- read the most recent Entity State Row per entity
- apply any Availability-window filter
- fetch the paired Component Versions
- assemble the Projection

### History Query

A History query returns Entity States over time for one Catalog Entity.

It should:

- read Entity State Rows for the entity in descending Version or time order
- optionally hydrate each Entity State with its paired Component Versions

This yields exact historical reads because the Pairing is stored explicitly in the Entity State Row.

## Naming Patterns

Catalog entity modules are scoped to one entity type.

Inside an entity module:

- do not repeat the entity name in function, argument, variable, or local type names
- use names such as `state`, `core`, `pricing`, `hydrate`, `getState`, `stateTable`, and `coreTable`
- reserve concrete entity names for physical database table names, public routing boundaries, and useful error messages

Default query and mutation names should not include `current` or `latest`.

The Catalog's default read surface is Current unless a query explicitly says otherwise.

Examples:

- use `get` instead of `getCurrent`
- use `list` instead of `listLatest`
- use `getState` instead of `getCurrentState`
- use `history` when reading historical Entity States

Use exact symbol names in this section only when the symbol expresses a durable architectural invariant.

## Extension Rules

When adding or reshaping an entity type:

- start with an Entity State Table and one or more Component Tables
- keep Entity State responsible for Availability and Pairing
- keep Component Tables responsible for content history only
- store Component Version numbers and content hashes in Entity State Rows
- keep default reads Current by convention
- add History queries when historical inspection is useful
- avoid entity-specific names inside entity-local modules
- avoid generic table-name-driven write helpers; entity modules should own concrete table inserts

Shared helpers should own generic bookkeeping only.

They may help with content hashing, Component append decisions, metadata shaping, or Projection assembly, but they should not obscure which concrete table is being written.

## Availability Window

The Catalog supports an Availability window rather than a simple available/unavailable split.

A Default query may include:

- available entities
- entities that became unavailable recently

This is a first-class read concern of the Catalog.

It is not an afterthought layered on top of content history.

## Example Timeline

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

## Why This Model

This architecture deliberately avoids several weaker alternatives.

### Not A Single Mutable State Row

A mutable row cannot preserve exact historical Entity States.

### Not Content Cloning For Availability

Availability is not content.

Cloning content Rows to represent unavailable states pollutes content history with non-content changes.

### Not Timestamp-Only Historical Reconstruction

Reconstructing Pairings from timestamps alone makes exact history implicit and fragile.

The Catalog stores the Pairing explicitly.

### Not Generic Table-Name-Driven Writes

A fully generic write path tends to hide concrete table ownership and weakens type clarity.

The Catalog can share bookkeeping helpers, but entity modules should retain responsibility for concrete Component and Entity State writes.

## Non-Goals

This architecture does not define:

- how data is discovered or fetched
- how external data is normalized before reaching the Catalog boundary
- how another system chooses to mark something unavailable
- a domain-specific glossary for any concrete entity type
- frontend presentation details

Those concerns matter, but they are outside the scope of the core Catalog architecture.

## Result

The result is a Catalog with two complementary histories:

- Component Version history: how content parts changed
- Entity State history: how the entity as a whole changed over time

That split is the core mechanism that makes the Catalog both precise and practical:

- precise enough for exact history
- practical enough for efficient default reads
- generic enough to apply across entity types
