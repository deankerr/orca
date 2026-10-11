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

## Projection ingestion

`ingestionNew` retains projections in separate transactions. Its `scan_ingestions` records
identify exact source inputs, with a null predecessor for baseline. The stage records the
last committed ingest key until finalization replaces it with `complete`; completed records
do not retain the stage sequence. Stage definitions may change between completed inputs,
but changing the sequence while an input is incomplete is unsupported.

The ingest order minimizes visible differences between projections. Partial output is visible
immediately. Each ingest commits its output and checkpoint together, including empty output.
Retries load the registered source input and resume after the checkpoint. Admission blocks the
following input until the current one is finalized. This timeline's reference clock advances
only at finalization, independently of partial visibility.

`work_id` represents Workpool ownership, including queuing, retry backoff and awaiting finalization.
Execution status is derived from Workpool. Admission assigns ownership atomically; projection
writes and completion callbacks reject or ignore superseded ownership. Only Workpool invokes the
worker action. Successful completion removes ownership and finalizes the record; terminal failure
removes ownership while preserving the checkpoint. Recovery resumes unfinished inputs and
reconciles finished work whose callback did not finalize the record.

The new clock and progress are available through `ingestionNew/state`. Existing product queries
and the legacy runner continue to use their existing tables and clock until their cutover.
