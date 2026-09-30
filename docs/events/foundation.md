# Foundation

## Observation semantics

- One event keeps an entity's changes for one ingestion together, including accompanying price and capability changes.
- The baseline establishes initial knowledge; events describe subsequent transitions in the observed inventory.
- Arrivals include reappearances. An ADD can carry an upstream `created_at` from an earlier day.
- Model/provider presence follows listed endpoints; losing the last endpoint produces REMOVE.
- Models without endpoints remain known in Catalog; their metadata changes do not produce Events.
- ADD carries `previously_known`; baseline knowledge and historical model records count as known.
- Earlier Listings supplies prior endpoint/provider presence; exact model IDs retain variant suffixes.
- Model knowledge is captured before Catalog writes and retained with Events work for delayed retries.
- Listings commits with Catalog; Events reads only listing observations earlier than its own `scan_at`.
- An absent boolean on older events means unclassified, never a discovery claim.
- The ingestion pair bounds the observed transition; `scan_at` records when ORCA first observed the resulting state.
- The stable address is `scan_at` + `entity_kind` + `entity_id`, surviving representation changes.
- The ingestion record permanently fixes the predecessor for that address.
- The feed spells observation time `observed_at`; consumers can use the same three-part address for deduplication.

## Revisable projections

- Events shares entity-owned fact selection with Catalog and pricing selection with price history.
- A fixed pair and its historical context yield stable events; projection improvements can revise historical output.
- Retained observations, explicit pairs and captured prior knowledge support reconstruction.
- Regeneration, backfill, and projection-version provenance remain deferred across V4.
