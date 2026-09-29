# Foundation

## Observation semantics

- One event keeps an entity's changes for one ingestion together, including accompanying price and capability changes.
- The baseline establishes initial knowledge; events describe subsequent transitions in the observed inventory.
- Arrivals include reappearances. An ADD can carry an upstream `created_at` from an earlier day.
- The ingestion pair bounds the observed transition; `scan_at` records when ORCA first observed the resulting state.
- The stable address is `scan_at` + `entity_kind` + `entity_id`, surviving representation changes.
- The ingestion record permanently fixes the predecessor for that address.
- The feed spells observation time `observed_at`; consumers can use the same three-part address for deduplication.

## Revisable projections

- Events shares entity-owned fact selection with Catalog and pricing selection with price history.
- A fixed observation pair normally yields stable events; projection improvements can revise historical output.
- Retained observations and explicit input pairs support reconstruction.
- Regeneration, backfill, and projection-version provenance remain deferred across V4.
