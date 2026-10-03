# Foundation

## Observation semantics

- One event keeps an entity's changes for one ingestion together, including accompanying price and capability changes.
- The baseline establishes initial knowledge; events describe subsequent transitions in the observed inventory.
- Arrivals include reappearances. An ADD can carry an upstream `created_at` from an earlier day.
- Model/provider presence follows listed endpoints; losing the last endpoint produces REMOVE.
- Models without endpoints remain known in Catalog; their metadata changes do not produce Events.
- ADD carries `previously_known`; earlier Listings establishes knowledge for all entity kinds, including baseline listings.
- Models also use Catalog `from_scan_at`, falling back to `scan_at` until backfilled; model IDs retain variant suffixes.
- Listings commits with Catalog; Events reads only listing observations earlier than its own `scan_at`.
- An absent boolean on older events means unclassified, never a discovery claim.
- The accepted scan pair bounds the observed transition; `scan_at` records when ORCA first observed the resulting state.
- The stable address is `scan_at` + `entity_kind` + `entity_id`, surviving representation changes.
- The ingestion record permanently fixes the predecessor for that address.
- The feed spells observation time `observed_at`; consumers can use the same three-part address for deduplication.

## Revisable projections

- Events shares entity-owned fact selection with Catalog and pricing selection with price history.
- A fixed pair and its historical context yield stable events; projection improvements can revise historical output.
- Retained scans, explicit pairs and listing history support reconstruction, subject to the model limitation below.
- Regeneration, backfill, and projection-version provenance remain deferred across V4.

## Known limitation: historical models

A legacy model without `from_scan_at`, previously observed only in the model list, has no earlier Listings evidence. Its Catalog
`scan_at` can establish prior knowledge, but a metadata update in the arrival scan or before delayed
event processing overwrites that evidence. It may then be announced as discovered despite already
being known. Regeneration can likewise change this classification after Catalog updates.

New Catalog identities and baseline rows now retain immutable `from_scan_at`, so later metadata
updates cannot erase their first observation. Existing rows remain unset until backfilled; their
fallback can still produce this rare false discovery. No model-ID snapshots are retained on work.
See the Catalog first-observation backfill notes for the historical reconstruction plan.
