# Catalog Glossary

This glossary is required reading for `catalog-architecture.md`.

It defines the storage-model vocabulary used by Catalog. It is intentionally meta-level: concrete entity names belong in domain documentation, not here.

## Meta-Model Concepts

| Term                   | Definition                                                                                                                               | Aliases to avoid                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Catalog**            | ORCA's durable store of time-aware entity knowledge and the read surfaces assembled from it.                                             | Views, projection layer, materialized data |
| **Catalog Entity**     | A durable thing tracked by the Catalog, without implying anything about its domain-specific content shape.                               | Record, doc, item                          |
| **Entity State**       | ORCA's time-aware understanding of a Catalog Entity at one point in history.                                                             | Entity version, revision                   |
| **Entity State Table** | The append-only table that stores Entity State Rows for one entity type.                                                                 | Head table, master table, index table      |
| **Entity State Row**   | One physical Row in an Entity State Table representing one Entity State.                                                                 | Head row, version row                      |
| **Content**            | ORCA-normalized stored data for one Catalog Entity.                                                                                      | Payload, state, component                  |
| **Snapshot**           | A stored record of Content at one point in time.                                                                                         | Content row, payload row                   |
| **Snapshots Table**    | The append-only table that stores Snapshots for one entity type.                                                                         | Content table, component table, sub-table  |
| **View**               | A mutable materialized record of the current Content and Availability for one Catalog Entity, maintained for efficient reads.            | Current row, live row                      |
| **Views Table**        | The mutable table that stores one View per Catalog Entity.                                                                               | Projection table, cache table              |
| **Availability**       | The Catalog property that expresses whether an entity is unavailable, represented by `unavailableAt` on Entity State Rows and Views.     | Lifecycle, status                          |
| **Content Hash**       | A deterministic hash of Content used to decide whether incoming Content differs from the current Entity State's referenced Snapshot.     | Version, checksum                          |
| **Current**            | The default state of Catalog data: the most recent Entity State and its Content, surfaced through the View.                              | Latest, live                               |
| **Row**                | A physical stored row in a Catalog table. A Row is not the same thing as the higher-level Entity State, Snapshot, or View it represents. | Entity, item, object                       |

## Read Shapes

| Term              | Definition                                                                   | Aliases to avoid                |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| **History query** | A read that returns Entity States over time for one Catalog Entity.          | Audit query, event log query    |
| **Lifecycle**     | The human-facing narrative of availability transitions across Entity States. | Availability field, status flag |

## Relationships

- A **Catalog** tracks many **Catalog Entities**.
- A **Catalog Entity** has one or more **Entity States** over time and exactly one **View**.
- An **Entity State Table** stores many **Entity State Rows** for one kind of **Catalog Entity**.
- An **Entity State Row** is one **Row** that stores exactly one **Entity State**.
- An **Entity State** records exactly one **Availability** value and references exactly one **Snapshot**.
- A **Snapshots Table** stores many **Snapshots** for one kind of **Catalog Entity**.
- A **Views Table** stores one **View** per **Catalog Entity**.
- A **History query** reads Entity States; default reads go through the **Views Table**.

## Example Dialogue

> **Dev:** "If a **Catalog Entity** becomes unavailable but its **Content** has not changed, do we create a new **Snapshot**?"
>
> **Domain expert:** "No. We append a new **Entity State Row** with changed **Availability** and keep the same Snapshot reference."
>
> **Dev:** "If the entity later appears again with unchanged **Content**, do we reuse that same **Snapshot**?"
>
> **Domain expert:** "Yes. Reappearance is another **Entity State Row** with `unavailableAt` omitted."
>
> **Dev:** "And regular `get`/`list` reads are Current by default?"
>
> **Domain expert:** "Right. We say `get`, not `getCurrent`, because Current is the default Catalog read state. The **View** always reflects it."

## Flagged Ambiguities

- "state" can refer to entity-visible Catalog state or local program state. Say **Entity State** where the Catalog concept matters.
- "payload" can refer to raw external data or ORCA-normalized stored content. Use **Content** for stored normalized data.
- "current" and "latest" should not appear in query names. Use **Current** in prose when explaining why the default query name is simply `get` or `list`.
- "snapshot" outside the Catalog context may refer to crawl or archive operations. Within Catalog, it is a defined term for a Content record in the Snapshots Table. Be explicit about which sense is intended.
