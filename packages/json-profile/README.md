# JSON profile

`profileJsonRecords` accepts in-memory JSON objects and reports their observed shapes and exact
value frequencies. It knows nothing about ORCA, storage or presentation. Use
[scan analysis](../scripts/scan-analysis/README.md) for the CLI and HTML viewer.

```ts
import { profileJsonRecords, viewProfile } from '@orca/json-profile'

const profile = profileJsonRecords(records)
const overview = viewProfile(profile)
const detail = viewProfile(profile, { paths: ['$[*]["quantization"]'], valueLimit: null })
```

The profile does not enforce an upstream schema, retain record identities, or report cross-field
correlations. Object key sets record which properties occurred together, not how their values relate.

- Paths are JSONPath expressions relative to the logical array of input records.
- `population` counts possible locations. A nested field's population is its containing objects,
  not necessarily the number of root records.
- `none` counts absent properties and is distinct from a present JSON `null`.
- Primitive branches retain every distinct native value and its frequency.
- Arrays retain exact length frequencies and profile all items together. Repeated items count
  repeatedly; array order and object property order do not affect the result.
- Output is deterministic across equivalent input orderings.

## Views

Profiling always produces the same full-detail tree. `viewProfile` derives a flat field view from
that tree; it does not change collection, sample observations, or run a different profiler.
The package is runtime-independent; filesystem access and HTML bundling belong to its callers.

- `paths` selects exact JSONPaths; omission selects all locations, including the root. An empty
  list selects none. `record_count` still describes the profiled population.
- `valueLimit` defaults to five entries per distribution, ordered by descending frequency with
  deterministic ties. Zero returns counts without entries; `null` returns all entries.
- Bounded views omit strings longer than 160 UTF-16 code units. Full views retain them exactly.
  Each distribution reports its total distinct count, completeness, omitted distinct count and
  omitted occurrence count. These totals include omitted long strings.
- Views call absent properties `missing`; full trees retain the original `none` field. Null remains
  a separate type. Array-item counts describe occurrences, including repetitions.
- Numeric and array-length summaries use weighted nearest-rank quantiles of all observations,
  regardless of the view limit. Numeric strings are never coerced into numbers.
- Field paths are values in a list, not dynamic object keys. The view can cross Convex transport
  without interpreting JSONPath strings as object field names.

Exact profiling is designed for one scan-sized population in memory. Views reduce output noise,
not profiling work or memory. Process separate scans sequentially; there is no approximate or
streaming mode.
