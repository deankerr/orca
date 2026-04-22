# Catalog Glossary

This glossary is required reading for `catalog-architecture.md`.

It defines the storage-model vocabulary used by Catalog. It is intentionally meta-level: concrete entity names belong in domain documentation, not here.

## Meta-Model Concepts

| Term                   | Definition                                                                                                                                  | Aliases to avoid                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Catalog**            | ORCA's durable store of versioned entity knowledge and the read surfaces assembled from it.                                                 | Views, projection layer, materialized data |
| **Catalog Entity**     | A durable thing tracked by the Catalog, without implying anything about its domain-specific content shape.                                  | Record, doc, item                          |
| **Entity State**       | ORCA's time-aware understanding of a Catalog Entity at one point in history.                                                                | Entity version, revision, snapshot         |
| **Entity State Table** | The append-only table that stores Entity State Rows for one entity type.                                                                    | Head table, master table, index table      |
| **Entity State Row**   | One physical Row in an Entity State Table representing one Entity State.                                                                    | Head row, snapshot row                     |
| **Availability**       | The Catalog property that expresses whether an entity is unavailable, represented by `unavailableAt`.                                       | Lifecycle, status                          |
| **Component**          | A distinct opaque part of a Catalog Entity whose content can change independently.                                                          | Sub-table part, child section              |
| **Component Content**  | ORCA-normalized stored data for one Component.                                                                                              | Payload, state                             |
| **Component Table**    | An append-only table that stores versioned content for one Component kind.                                                                  | Sub-table, child table                     |
| **Component Version**  | A versioned content change recorded in a Component Table for one Catalog Entity.                                                            | Payload version, entity version            |
| **Pairing**            | The set of Component Versions associated with an Entity State.                                                                              | Snapshot inference, implicit mix           |
| **Projection**         | An app-facing assembled read shape built from Entity State and Component Versions.                                                          | Entity, row, stored shape                  |
| **Row**                | A physical stored row in a Catalog table. A Row is not the same thing as the higher-level Entity State, Component, or Projection it stores. | Entity, component, projection              |
| **Version**            | A monotonically increasing number scoped to one Entity State history or one Component history.                                              | Revision, generation                       |
| **Current**            | The default state of Catalog data: the most recent Entity State and its paired Component Versions.                                          | Latest, live                               |

## Read Shapes And History

| Term                    | Definition                                                                                                          | Aliases to avoid                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Default query**       | A read that returns the Current Projection for one or more Catalog Entities.                                        | Current query, latest version query |
| **History query**       | A read that returns Entity States over time for one Catalog Entity and can hydrate their paired Component Versions. | Audit query, event log query        |
| **Availability window** | A query filter that includes available entities plus entities unavailable within a recent time range.               | Soft delete window, grace period    |
| **Lifecycle**           | The human-facing narrative of availability transitions across Entity States.                                        | Availability field, status flag     |

## Version Number

`version` in storage should be read as shorthand for `version_number`.

A Version is not a standalone object or Row.

The same word is used in two scoped places:

- Entity State Rows use `version` for the entity's state history.
- Component Rows use `version` for that component's content history.

Avoid introducing a generic "Entity Version" concept unless the system develops a need for it.

## Relationships

- A **Catalog** tracks many **Catalog Entities**.
- A **Catalog Entity** has one or more **Entity States** over time.
- An **Entity State Table** stores many **Entity State Rows** for one kind of **Catalog Entity**.
- An **Entity State Row** is one **Row** that stores exactly one **Entity State**.
- An **Entity State** records exactly one **Availability** state for its **Catalog Entity**.
- A **Catalog Entity** is made up of one or more **Components**.
- A **Component Table** stores many **Component Versions** for one kind of **Component**.
- A **Component Version** is stored as one **Row** in a Component Table.
- A **Pairing** associates an **Entity State** with one or more **Component Versions**.
- A **Projection** is assembled from an **Entity State** and its paired **Component Versions**.
- A **History query** reads Entity States; a **Default query** reads Current state.

## Example Dialogue

> **Dev:** "If a **Catalog Entity** becomes unavailable but none of its **Component Content** changes, do we create a new **Component Version**?"
>
> **Domain expert:** "No. We append a new **Entity State Row** with changed **Availability** and keep the same **Pairing** of Component Versions."
>
> **Dev:** "So the **History query** reads the sequence of **Entity States**, then hydrates each state with its paired Component Versions?"
>
> **Domain expert:** "Exactly. The **Projection** is assembled from the Entity State Row plus the referenced Component Rows."
>
> **Dev:** "And regular `get`/`list` reads are Current by default?"
>
> **Domain expert:** "Right. We say `get`, not `getCurrent`, because Current is the default Catalog read state."

## Flagged Ambiguities

- "version" can refer to Entity State history or Component history. Treat it as a scoped **Version** number, not a standalone noun.
- "state" can refer to entity-visible Catalog state or local program state. Say **Entity State** where the Catalog concept matters.
- "payload" can refer to raw external data or ORCA-normalized stored content. Use **Component Content** for stored normalized data.
- "record", "doc", and "item" are vague at this level. Use **Row** for physical storage and the relevant higher-level concept for meaning.
- "current" and "latest" should not appear in default query names. Use **Current** in prose when explaining why the default query name is simply `get` or `list`.
- "head table" implied a mutable pointer more than an append-only history table. Prefer **Entity State Table**.
- "sub-table" described structure but not meaning. Prefer **Component Table**.
- "snapshot" collides with ORCA's existing archive and crawl snapshot language. Avoid it here.
- "master table" and "index table" sound infrastructural and suggest semantics we do not want. Prefer **Entity State Table**.
