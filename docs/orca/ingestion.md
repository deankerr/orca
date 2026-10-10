# Collection and ingestion

## Capture boundary

Collection preserves raw artifacts independently of ingestion and extraction policy. Capture
time is assigned when collection finishes; the upstream requests can observe different instants.
A scan therefore describes a collection window rather than an atomic upstream snapshot.

## Comparison

Catalog, price history, and Events apply shared comparison semantics to their own projections.
Equality is defined on normalized facts before storage encoding:

- Object key order is immaterial.
- String arrays compare as sets, ignoring order and duplicate counts.
- Other arrays compare by index, including pricing override lists.
- Absence, null, false, and zero remain distinct observed values.

For endpoints present in both scans, price history and pricing Events observe changes to the
same complete quote. Alert eligibility does not affect quote retention.

Accepted comparator limitations are omitted `__proto__` string-set members and positional
comparison of arrays directly nested in arrays. Supported entity shapes avoid the latter case.

## Acceptance and completion

Catalog, Listings, Pricing, and current stats commit together before the ORCA clock advances.
Consumers can rely on those projections through the accepted scan even while downstream work
is pending.

- Initialization seeds baseline knowledge without generating creation events for already-present facts.
- Downstream processors use historical context bounded to their accepted scan pair.
- Each processor's output and completion commit together, including empty output.
- Later successful work leaves earlier incomplete obligations outstanding.

Advancing current knowledge does not establish that all historical Events or stats have been
produced. Acceptance and downstream completion are separate guarantees.
