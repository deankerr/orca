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
- Entity labels optimized for reads
- temporal Entity State history

### Current Is The Default Read State

The default state of Catalog data is **Current**: the most recent Entity State and its Content, surfaced through the View.

This is why query names are simple names such as `get` and `list` rather than `getCurrent`, `getLatest`, `listCurrent`, or `listLatest`.

Historical access must be explicit through a specific `history` query.

### Content History And Entity History Are Different Concerns

Content may change without changing Availability. Availability may change without any Content change.

The Catalog must represent both without forcing either one into the other's storage model.

### Historical Reads Must Be Exact

The Catalog does not depend on reconstructing historical Entity States from timestamps alone.

Each Entity State Row stores an explicit reference to the Snapshot that was true at that point in time.

### Rows Are Storage, Not Meaning

Higher-level concepts such as Entity State, Snapshot, and View are represented by Rows, but they are not interchangeable with Rows in language or design.

## Storage Model

Each entity type has three tables:

- one Entity State Table
- one Snapshots Table
- one Views Table

### Entity State Table

The Entity State Table is append-only.

Each Entity State Row records entity identity and label data, when it was observed (`observedAt`), a reference to its Snapshot (`snapshotId`), a reference to the entity's View (`viewId`), a hash for fast Content comparison (`contentHash`), and Availability.

### Snapshots Table

The Snapshots Table is append-only.

Each Snapshot stores normalized Content for one Catalog Entity at a point in time. Snapshots do not store Availability.

### Views Table

The Views Table stores one mutable View per Catalog Entity.

A View holds the current Content and Availability for its entity, maintained so default reads do not require traversing the Entity State Table. The View is created on first observation and replaced or patched on subsequent writes.

## Availability Model

Availability is a property of Entity State and View, not Content.

It is represented by a sparse field `unavailableAt`:

- `unavailableAt = undefined` — the entity is available.
- `unavailableAt = timestamp` — the entity has been unavailable since that time.

This allows Availability changes without new Snapshots, reappearance without cloning content, and exact availability history alongside content history.

## Write Model

Incoming entity data implicitly means the Catalog Entity is available.

An Entity State Row is appended when at least one of the following is true:

- Content changed
- Availability changed
- the entity appeared for the first time

When Content changes, the Catalog appends a new Snapshot, replaces the View with the new Content, and appends a new Entity State Row.

When only Availability changes, the Catalog patches the View and appends a new Entity State Row referencing the existing Snapshot.

If neither Content nor Availability changed, the Catalog remains unchanged.

The write path must re-read the prior Entity State inside the transactional boundary before writing.

## Read Model

### History Query

A History query returns Entity States over time for one Catalog Entity, reading Entity State Rows in descending observed-time order and hydrating each with its Snapshot.

Exact historical reads are possible because each Entity State Row carries an explicit Snapshot reference.

## Naming Patterns

Catalog entity modules are scoped to one entity type.

Inside an entity module:

- do not repeat the entity name in function, argument, variable, or local type names
- use names such as `state`, `content`, `snapshot`, `view`, `hydrate`, `getState`, `stateTable`, `snapshotsTable`, `viewsTable`, and `contentFields`
- reserve concrete entity names for physical database table names, public routing boundaries, and useful error messages

Query and mutation names should not include `current` or `latest`. Examples:

- use `get` instead of `getCurrent`
- use `list` instead of `listLatest`
- use `getState` instead of `getCurrentState`
- use `history` when reading historical Entity States

## Example Timeline

An entity can evolve like this:

```text
state 1 -> available, snapshot: A
state 2 -> unavailable, snapshot: A
state 3 -> available, snapshot: A
state 4 -> available, snapshot: B
```

This expresses content changes, unavailable transitions, and reappearance without new content — without cloning any Snapshots.

## Why This Model

### Not A Single Mutable State Row

A mutable entity state cannot preserve exact historical Entity States. The Views Table is mutable, but it stores only current state — history is preserved in the append-only State and Snapshots Tables.

### Not Content Cloning For Availability

Availability is not content. Cloning Snapshots to represent unavailable states would pollute content history with non-content changes.

### Not Timestamp-Only Historical Reconstruction

Reconstructing Snapshot references from timestamps alone makes exact history implicit and fragile. The Catalog stores the Snapshot reference explicitly in every Entity State Row.

### Not Generic Table-Name-Driven Writes

A fully generic write path tends to hide concrete table ownership and weakens type clarity. The Catalog can share bookkeeping helpers, but entity modules should retain responsibility for concrete writes.

## Non-Goals

This architecture does not define:

- how incoming data is discovered or fetched
- how external data is normalized before reaching the Catalog boundary
- how another system chooses to mark something unavailable
- a domain-specific glossary for any concrete entity type
- frontend presentation details

## Result

The result is a Catalog with three complementary tables per entity:

- Entity State history: how the entity as a whole changed over time
- Snapshot history: how normalized content changed
- View: the current materialized state for efficient reads

That structure makes the Catalog precise enough for exact history, practical enough for efficient default reads, and generic enough to apply across entity types.
