# JSON profile

`profileJsonRecords` accepts in-memory JSON objects and reports their observed shapes and exact
value frequencies. It knows nothing about ORCA, storage or presentation. Use
[scan analysis](../scan-analysis/README.md) for the CLI and HTML viewer.

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

Exact frequencies can consume significant memory for fields with many distinct values. The scan
tool profiles one scan at a time; do not pool long histories without an explicit population and
memory policy.
