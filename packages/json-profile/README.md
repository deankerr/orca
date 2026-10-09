# JSON profile

A field's population is its containing objects; nested fields can have a different denominator from
the root record count.

- `missing` counts absent properties; JSON `null` is a present value.
- Array-item counts include repetitions. They count occurrences, not supporting entities.
- Numeric strings remain strings. Numeric summaries use weighted nearest-rank quantiles.
- Object key sets describe which properties occurred together, without correlating values.

Profiling retains exact values for one scan-sized population in memory. Limiting a view
reduces output, not collection work or memory use.
