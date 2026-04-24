# Catalog Glossary

This glossary is required reading for `catalog-architecture.md`.

It defines the storage-model vocabulary used by Catalog. It is intentionally meta-level: concrete entity names belong in domain documentation, not here.

## Meta-Model Concepts

| Term                   | Definition                                                                                                                               | Aliases to avoid                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Catalog**            | ORCA's durable store of time-aware entity knowledge and the read surfaces assembled from it.                                             | Views, projection layer, materialized data |
| **Catalog Entity**     | A durable thing tracked by the Catalog, without implying anything about its domain-specific content shape.                               | Record, doc, item                          |
| **Entity State**       | ORCA's time-aware understanding of a Catalog Entity at one point in history.                                                             | Entity version, revision, snapshot         |
| **Entity State Table** | The append-only table that stores Entity State Rows for one entity type.                                                                 | Head table, master table, index table      |
| **Entity State Row**   | One physical Row in an Entity State Table representing one Entity State.                                                                 | Head row, snapshot row                     |
| **Content**            | ORCA-normalized stored data for one Catalog Entity.                                                                                      | Payload, state, component                  |
| **Content Table**      | The append-only table that stores Content Rows for one entity type.                                                                      | Component table, sub-table, child table    |
| **Content Row**        | One physical Row in a Content Table.                                                                                                     | Payload row, component row                 |
| **Availability**       | The Catalog property that expresses whether an entity is unavailable, represented by `unavailableAt` on Entity State Rows.               | Lifecycle, status                          |
| **Content Hash**       | A deterministic hash of Content used to decide whether incoming Content differs from the current Entity State's referenced Content Row.  | Version, checksum                          |
| **Current**            | The default state of Catalog data: the most recent Entity State and its referenced Content Row.                                          | Latest, live                               |
| **Row**                | A physical stored row in a Catalog table. A Row is not the same thing as the higher-level Entity State or Content concept it represents. | Entity, item, object                       |

## Read Shapes And History

| Term              | Definition                                                                                    | Aliases to avoid                    |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Default query** | A read that returns the Current Entity State and referenced Content for one or more entities. | Current query, latest version query |
| **History query** | A read that returns Entity States over time for one Catalog Entity.                           | Audit query, event log query        |
| **Lifecycle**     | The human-facing narrative of availability transitions across Entity States.                  | Availability field, status flag     |

## Relationships

- A **Catalog** tracks many **Catalog Entities**.
- A **Catalog Entity** has one or more **Entity States** over time.
- An **Entity State Table** stores many **Entity State Rows** for one kind of **Catalog Entity**.
- An **Entity State Row** is one **Row** that stores exactly one **Entity State**.
- An **Entity State** records exactly one **Availability** value for its **Catalog Entity**.
- An **Entity State** references exactly one **Content Row** by `rowId`.
- A **Content Table** stores many **Content Rows** for one kind of **Catalog Entity**.
- A **Content Row** is one **Row** that stores normalized **Content**.
- A **History query** reads Entity States; a **Default query** reads Current state.

## Example Dialogue

> **Dev:** "If a **Catalog Entity** becomes unavailable but its **Content** has not changed, do we create a new **Content Row**?"
>
> **Domain expert:** "No. We append a new **Entity State Row** with changed **Availability** and keep the same `rowId`."
>
> **Dev:** "If the entity later appears again with unchanged **Content**, do we reuse that same **Content Row**?"
>
> **Domain expert:** "Yes. Reappearance is another **Entity State Row** with `unavailableAt` omitted."
>
> **Dev:** "And regular `get`/`list` reads are Current by default?"
>
> **Domain expert:** "Right. We say `get`, not `getCurrent`, because Current is the default Catalog read state."

## Flagged Ambiguities

- "state" can refer to entity-visible Catalog state or local program state. Say **Entity State** where the Catalog concept matters.
- "payload" can refer to raw external data or ORCA-normalized stored content. Use **Content** for stored normalized data.
- "record", "doc", and "item" are vague at this level. Use **Row** for physical storage and the relevant higher-level concept for meaning.
- "current" and "latest" should not appear in default query names. Use **Current** in prose when explaining why the default query name is simply `get` or `list`.
- "head table" implied a mutable pointer more than an append-only history table. Prefer **Entity State Table**.
- "component", "sub-table", and "child table" describe a previous storage model. Prefer **Content Table**.
- "snapshot" collides with ORCA's existing archive and crawl snapshot language. Avoid it here.
- "master table" and "index table" sound infrastructural and suggest semantics we do not want. Prefer **Entity State Table**.
