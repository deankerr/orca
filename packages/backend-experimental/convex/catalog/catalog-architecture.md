# Catalog Architecture

Read `catalog-glossary.md` first. This document relies on those terms and avoids repeating pure definitions unless a nuance or invariant matters.

## Purpose

`Catalog` is ORCA's durable store of time-aware entity knowledge.

Its job is to:

- preserve ORCA's historical understanding of entity data
- support efficient default reads for application surfaces
- support exact historical reads for one entity over time
- represent availability changes without cloning content

This document describes the core Catalog architecture only.

It intentionally does not describe:

- incoming-data transformation details
- external-source-specific behavior
- domain-specific entity meaning

Data arrives at the Catalog boundary already shaped as a Catalog Entity plus Content.

## Design Goals

- Keep Catalog-visible history append-only.
- Preserve exact historical Entity States, not reconstructed approximations.
- Represent availability without treating it as Content.
- Keep unchanged incoming data out of the write path.
- Keep entity functionality symmetrical unless there is a deliberate domain reason not to.
- Keep the model generic so it applies uniformly across entity types.

## Core Invariants

### Catalog State Is ORCA-Owned

The Catalog stores ORCA's understanding of an entity, not a verbatim copy of external data.

That means the Catalog may model concepts that do not exist directly in incoming data, such as:

- Availability over time
- Entity labels optimized for default reads
- temporal Entity State history

### Current Is The Default Read State

The default state of Catalog data is **Current**: the most recent Entity State and its referenced Content Row.

This is why default query names are simple names such as `get` and `list` rather than `getCurrent`, `getLatest`, `listCurrent`, or `listLatest`.

Historical access must be explicit through a specific `history` query.

### Content History And Entity History Are Different Concerns

A Content change and an Entity State change are not the same thing.

Content may change without changing Availability.
Availability may change without any Content change.

The Catalog must represent both without forcing either one into the other's storage model.

### Historical Reads Must Be Exact

The Catalog should not depend on reconstructing historical Entity States from timestamps alone.

If a historical Entity State matters, the Catalog stores the exact `rowId` that was true at that point in time.

### Rows Are Storage, Not Meaning

A Row is the physical stored unit in a Catalog table.

Higher-level concepts such as Entity State and Content are represented by Rows, but they are not interchangeable with Rows in language or design.

## Storage Model

Each entity type has:

- one Entity State Table
- one Content Table

### Entity State Table

The Entity State Table is append-only.

Each Entity State Row records:

- entity identity and default-read label data
- when this Entity State was observed by the Catalog
- the `rowId` of the Content Row for this Entity State
- the `contentHash` of that Content Row
- Availability

The `contentHash` is part of Entity State so incoming Content can be compared against the current state without hydrating the full Content Row.

The `rowId` is part of Entity State so historical reads know exactly which Content Row belonged to that Entity State.

### Content Table

The Content Table is append-only.

Each Content Row records normalized Content for one Catalog Entity.

Content Rows do not store Availability.

## Availability Model

Availability is a property of Entity State, not Content.

It is represented as a sparse property:

- `unavailableAt`

Semantics:

- `unavailableAt = undefined` means the entity is available in this Entity State.
- `unavailableAt = timestamp` means the entity is unavailable from that time onward in this Entity State.

This allows:

- Availability changes without new Content Rows
- reappearance without cloning content
- exact availability history alongside content history

## Write Model

A Catalog write may append zero or one Content Row and zero or one Entity State Row.

Incoming entity data implicitly means the Catalog Entity is available.

An Entity State Row is appended when at least one of the following is true:

- Content changed
- Availability changed
- the entity appeared for the first time

When Content changes, the Catalog appends a new Content Row and a new Entity State Row referencing it.

When only Availability changes, the Catalog appends a new Entity State Row that references the existing Content Row.

If neither Content nor Availability changed in a Catalog-visible way, the Catalog remains unchanged.

The write path must re-read the prior Entity State inside the transactional boundary before appending rows.

## Read Model

The Catalog supports two primary read shapes.

### Default Query

A Default query returns the Current Entity State and referenced Content for one or more Catalog Entities.

It should:

- read the most recent Entity State Row per entity
- fetch the referenced Content Row
- return both pieces without implying a flattened storage shape

### History Query

A History query returns Entity States over time for one Catalog Entity.

It should:

- read Entity State Rows for the entity in descending observed-time order
- optionally hydrate each Entity State with its referenced Content Row

This yields exact historical reads because the Content Row reference is stored explicitly in the Entity State Row.

## Naming Patterns

Catalog entity modules are scoped to one entity type.

Inside an entity module:

- do not repeat the entity name in function, argument, variable, or local type names
- use names such as `state`, `content`, `hydrate`, `getState`, `stateTable`, `contentTable`, and `contentFields`
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

- start with an Entity State Table and one Content Table
- keep Entity State responsible for Availability, `rowId`, and `contentHash`
- keep the Content Table responsible for normalized Content only
- keep default reads Current by convention
- add History queries when historical inspection is useful
- avoid entity-specific names inside entity-local modules
- avoid generic table-name-driven write helpers; entity modules should own concrete table inserts

Shared helpers should own generic bookkeeping only.

They may help with content hashing, skip decisions, or hydration, but they should not obscure which concrete table is being written.

## Example Timeline

An entity can evolve like this:

```text
state 1 -> available, rowId: content 1
state 2 -> unavailable, rowId: content 1
state 3 -> available, rowId: content 1
state 4 -> available, rowId: content 2
```

This expresses:

- content changes
- unavailable transitions
- reappearance without new content

without cloning any Content Rows.

## Why This Model

This architecture deliberately avoids several weaker alternatives.

### Not A Single Mutable State Row

A mutable row cannot preserve exact historical Entity States.

### Not Content Cloning For Availability

Availability is not content.

Cloning Content Rows to represent unavailable states pollutes content history with non-content changes.

### Not Timestamp-Only Historical Reconstruction

Reconstructing Content Row references from timestamps alone makes exact history implicit and fragile.

The Catalog stores the `rowId` explicitly.

### Not Generic Table-Name-Driven Writes

A fully generic write path tends to hide concrete table ownership and weakens type clarity.

The Catalog can share bookkeeping helpers, but entity modules should retain responsibility for concrete Entity State and Content writes.

## Non-Goals

This architecture does not define:

- how incoming data is discovered or fetched
- how external data is normalized before reaching the Catalog boundary
- how another system chooses to mark something unavailable
- a domain-specific glossary for any concrete entity type
- frontend presentation details

Those concerns matter, but they are outside the scope of the core Catalog architecture.

## Result

The result is a Catalog with two complementary histories:

- Content history: how normalized content changed
- Entity State history: how the entity as a whole changed over time

That split is the core mechanism that makes the Catalog both precise and practical:

- precise enough for exact history
- practical enough for efficient default reads
- generic enough to apply across entity types
