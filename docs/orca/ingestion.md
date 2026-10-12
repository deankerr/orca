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

`ingestionNew` registers exact source inputs, with a null predecessor for baseline. Each stage
derives its output from the scan pair and runs concurrently with the other unfinished stages.
Stage definitions and source contents must remain stable while an input is incomplete.

The baseline is a registered input requiring only its selected capture. It establishes current
entities, listings, complete price quotes, and current and historical stats without generating
creation events. First-observation times refer to this capture, not upstream creation. Only
the previous scan in a loaded pair may have a null scan time; its collections are then empty.
A real empty scan retains its timestamp and participates in ordinary change detection.

Baseline selection fixes the exact capture before any stage writes. A pending baseline already
establishes the timeline's starting point, even though the completion clock remains null.
Retries resume that input; changing the starting point requires a fresh timeline.

Each stage commits its output and completion together, including empty output. Overlapping
attempts can repeat computation, but retained output is deduplicated by input and stage. Partial
output is immediately visible. Failed stages leave successful stages committed; retries load
the same source input and run only unfinished stages.

The last outstanding stage marks the input complete and schedules discovery of the next input
in its write transaction. Completed records retain no stage list. Admission permits the next
source input only after the current input is complete. This timeline's reference clock advances
with completion, independently of execution acknowledgements and partial visibility.

Stages retain their entire output in one mutation. This is an accepted size limit: large inputs
can exceed function argument, transaction, or document limits, and retries cannot reduce that
output. Current entity writes also perform one indexed lookup per row. Introduce bounded batches
and batch progress when supported input sizes need to exceed those limits.

The new clock and progress are available through `ingestionNew/state`. Existing product queries
and the legacy runner continue to use their existing tables and clock until their cutover.
