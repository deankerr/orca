# Foundation

## Observation semantics

- One event keeps an entity's changes for one ingestion together, including accompanying price and capability changes.
- The baseline establishes initial knowledge; events describe subsequent transitions in the observed inventory.
- Arrivals include reappearances. An ADD can carry an upstream `created_at` from an earlier day.
- Model/provider presence follows listed endpoints; losing the last endpoint produces REMOVE.
- Models without endpoints remain known in Catalog; their metadata changes do not produce Events.
- ADD carries `previously_known`; earlier Listings establishes knowledge for all entity kinds, including baseline listings.
- Models also count as known when their current Catalog `scan_at` predates the event; exact model IDs retain variant suffixes.
- Listings commits with Catalog; Events reads only listing observations earlier than its own `scan_at`.
- An absent boolean on older events means unclassified, never a discovery claim.
- The ingestion pair bounds the observed transition; `scan_at` records when ORCA first observed the resulting state.
- The stable address is `scan_at` + `entity_kind` + `entity_id`, surviving representation changes.
- The ingestion record permanently fixes the predecessor for that address.
- The feed spells observation time `observed_at`; consumers can use the same three-part address for deduplication.

## Revisable projections

- Events shares entity-owned fact selection with Catalog and pricing selection with price history.
- A fixed pair and its historical context yield stable events; projection improvements can revise historical output.
- Retained observations, explicit pairs and listing history support reconstruction, subject to the model limitation below.
- Regeneration, backfill, and projection-version provenance remain deferred across V4.

## Known limitation: historical models

A model previously observed only in the model list has no earlier Listings evidence. Its Catalog
`scan_at` can establish prior knowledge, but a metadata update in the arrival scan or before delayed
event processing overwrites that evidence. It may then be announced as discovered despite already
being known. Regeneration can likewise change this classification after Catalog updates.

We accept this rare false discovery rather than retaining model-ID snapshots on every ingestion's
work record. The path to resolving it is an immutable Catalog `first_scan_at`: preserve the first
observation when updating model facts and compare it with the event's `scan_at`. Existing models
would need a history-derived backfill or an explicitly documented baseline before relying on it.
