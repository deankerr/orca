# Collection and ingestion

## Capture boundary

Collection preserves raw artifacts independently of ingestion and extraction policy. Capture
time is assigned when collection finishes; the upstream requests can observe different instants.
A scan therefore describes a collection window rather than an atomic upstream snapshot.

## Acceptance and completion

Catalog, Listings, Pricing, and current stats commit together before the ORCA clock advances.
Consumers can rely on those projections through the accepted scan even while downstream work
is pending.

- Initialization seeds baseline knowledge without generating creation events for already-present facts.
- Downstream processors use historical context bounded to their accepted scan pair.
- Each processor's output and completion commit together, including empty output.
- Later successful work leaves earlier incomplete obligations outstanding.

Acceptance and downstream completion are separate guarantees: advancing current knowledge does
not establish that all historical Events or stats have been produced.
