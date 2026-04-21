# Catalog Glossary

## Meta-model concepts

| Term                   | Definition                                                                                                 | Aliases to avoid                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Catalog**            | ORCA's durable store of versioned entity knowledge and the read surfaces assembled from it.                | Views, projection layer, materialized data |
| **Catalog Entity**     | A durable thing tracked by the catalog, without implying anything about its domain-specific content shape. | Record, doc, item                          |
| **Entity State**       | ORCA's time-aware understanding of a Catalog Entity at one point in history.                               | Entity version, revision, snapshot         |
| **Entity State Table** | The append-only table that stores Entity State rows for one entity type.                                   | Head table, master table, index table      |
| **Entity State Row**   | One stored row representing one Entity State.                                                              | Head row, snapshot row                     |
| **Availability**       | The catalog property that expresses whether an entity is unavailable, represented by `unavailableAt`.      | Lifecycle, status                          |
| **Component**          | A distinct opaque part of a Catalog Entity whose content can change independently.                         | Sub-table part, child section              |
| **Component Content**  | ORCA-normalized stored data for one Component.                                                             | Payload, state                             |
| **Component Table**    | An append-only table that stores versioned content for one Component kind.                                 | Sub-table, child table                     |
| **Component Version**  | A versioned content change recorded in a Component Table for one Catalog Entity.                           | Payload version, entity version            |
| **Pairing**            | The set of Component Versions associated with an Entity State.                                             | Snapshot inference, implicit mix           |
| **Projection**         | An app-facing assembled read shape built from Entity State and Component Versions.                         | Entity, row, stored shape                  |

## Collection and change detection

| Term                       | Definition                                                                                                          | Aliases to avoid          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Observation**            | A successful fact collected from upstream during a run.                                                             | Payload, snapshot row     |
| **Reconciliation**         | The process that compares Observations with catalog knowledge and decides whether to emit catalog-visible changes.  | Sync, ingest              |
| **Collection bookkeeping** | Internal tracking used to manage detection and completeness without changing catalog-visible state.                 | State, metadata           |
| **Decisive change**        | A change that should append a new Entity State Row or Component Version because the catalog-visible entity changed. | Checkpoint, heartbeat     |
| **Reappearance**           | A transition where an unavailable Catalog Entity becomes available again, with or without new Component Versions.   | Return event, rediscovery |

## Read shapes and history

| Term                    | Definition                                                                                                          | Aliases to avoid                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Default query**       | A read that returns the most recent Projection for one or more Catalog Entities.                                    | Current query, latest version query |
| **History query**       | A read that returns Entity States over time for one Catalog Entity and can hydrate their paired Component Versions. | Audit query, event log query        |
| **Availability window** | A query filter that includes available entities plus entities unavailable within a recent time range.               | Soft delete window, grace period    |
| **Lifecycle**           | The human-facing narrative of availability transitions across Entity States.                                        | Availability field, status flag     |

## Relationships

- A **Catalog** tracks many **Catalog Entities**.
- A **Catalog Entity** has one or more **Entity States** over time.
- An **Entity State Table** stores many **Entity State Rows** for one kind of **Catalog Entity**.
- An **Entity State Row** stores exactly one **Entity State**.
- An **Entity State** records exactly one **Availability** state for its **Catalog Entity**.
- A **Catalog Entity** is made up of one or more **Components**.
- A **Component Table** stores many **Component Versions** for one kind of **Component**.
- A **Pairing** associates an **Entity State** with one or more **Component Versions**.
- A **Projection** is assembled from an **Entity State** and its paired **Component Versions**.
- **Reconciliation** consumes **Observations** and may emit new **Component Versions** and or new **Entity State Rows**.
- **Collection bookkeeping** may influence **Reconciliation**, but it is not part of the **Catalog**.
- A **Reappearance** always creates a new **Entity State Row** and only creates new **Component Versions** if content changed.

## Example dialogue

> **Dev:** "If a **Catalog Entity** becomes unavailable but none of its **Component Content** changes, do we create a new **Component Version**?"
>
> **Domain expert:** "No. We append a new **Entity State Row** with changed **Availability** and keep the same **Pairing** of Component Versions."
>
> **Dev:** "So the **History query** reads the sequence of **Entity States**, then hydrates each state with its paired Component Versions?"
>
> **Domain expert:** "Exactly. The **Projection** is assembled from the state row plus the referenced component data."
>
> **Dev:** "And **Collection bookkeeping** never enters the **Catalog** unless **Reconciliation** decides there was a **Decisive change**?"
>
> **Domain expert:** "Right. Only catalog-visible changes write new Entity State Rows or Component Versions."

## Flagged ambiguities

- "version" was used for both whole-entity temporal state and component content history. Use **Component Version** for content history and avoid introducing a separate "Entity Version" term for now.
- "state" was used for entity-visible catalog state, availability, and collection bookkeeping. Avoid bare "state" where precision matters and instead say **Entity State**, **Availability**, or **Collection bookkeeping**.
- "payload" was used for both raw upstream JSON and ORCA-normalized stored content. Use **Observation** or "raw upstream payload" for upstream data, and **Component Content** for stored normalized data.
- "head table" implied a mutable pointer more than an append-only history table. Prefer **Entity State Table**.
- "sub-table" described structure but not meaning. Prefer **Component Table**.
- "snapshot" collides with ORCA's existing archive and crawl snapshot language. Avoid it here.
- "master table" and "index table" sound infrastructural and suggest semantics we do not want. Prefer **Entity State Table**.
- This glossary is intentionally meta-level. Terms like model, endpoint, and provider belong in a separate domain glossary rather than this storage-model vocabulary.
