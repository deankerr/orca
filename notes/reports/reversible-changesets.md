# Reversible changesets exploration

## Scope

This report explores a representation in which an observed JSON document is followed by reversible
changesets rather than another full copy of that document. It is an investigation, not a storage or
product decision.

The existing raw bundle archive remains the primary evidence base in every interpretation below. It
contains exact upstream payload bytes, source metadata, and digests; it is not dependent on any
changeset codec or materialization policy. The question is whether changesets are useful alongside
those bundles, either in a raw-oriented representation or a rebuildable projection.

## The basic property

Given two JSON values, a changeset can retain enough information to move between them in both directions:

- an addition records the added value, so its inverse removes it;
- a removal records the removed value, so its inverse restores it;
- an update records both the prior and next values, so either value can be restored.

This does not require a schema for every field in the JSON value. A changeset can preserve an
unknown object, property, scalar, or array as data. A schema is still useful when a consumer needs
to assign domain meaning, validate a value, index it efficiently, render it, or make a policy decision.

`json-diff-ts` provides `diff`, `applyChangeset`, and `revertChangeset` operations. The Area 2
experiment already compares keyed model and endpoint documents between crawls in
`apps/labs/src/area-2/bin.ts`. Its output demonstrates that a crawl can be represented as a compact
set of field updates, additions, and removals after an initial state is available.

## Observations from the archive samples

The root output samples show several useful patterns:

- Many adjacent crawls are unchanged. `output2.txt` has eight consecutive unchanged crawls before
  a three-item change containing a display-name update, a price update, and a new endpoint.
- A high-frequency price period can consist of only a few changed fields per crawl. In
  `output3.txt`, the initial changed crawls contain 3-12 updates, mostly endpoint pricing values.
- A full entity addition naturally carries a complete document in the changeset. This is enough to
  reconstruct that entity without having to know its internal shape in advance.
- Naive array comparison can be misleading. `output1.txt` contains large groups of indexed
  `supported_parameters` updates caused by a reordering, alongside much smaller meaningful changes.

The existing full-history analysis provides broader context: 19,245 crawls produced 22,947 selected
field changes, while roughly three quarters of crawls had no selected core change. That sparsity
does not prove that a changeset representation is the best format, but it makes it worth measuring.

## Possible representation boundaries

### Exact raw capture with deltas

One possibility is to store periodic exact API results as full snapshots and represent intervening
observations as changesets over the full source-shaped JSON payload.

This would preserve newly introduced upstream fields automatically. It could also make the raw
history seekable without decoding every full bundle between two points. The raw archive would still
retain the original observation bytes, so a bug in change generation or application would not make
the evidence unrecoverable.

Questions for this boundary include:

- Whether upstream payload structure is stable enough to make a full-bundle diff useful rather than
  noisy.
- Whether the space saved after compression is material relative to independently compressed raw
  bundles.
- Whether source-shaped transient or traversal metadata creates changes that are useful to retain.
- Whether a whole-bundle changeset is convenient for partial reads such as one endpoint's history.

### Rebuildable projection with deltas

Another possibility is to materialize a selected document set and store a baseline plus subsequent
changesets. For example, endpoint documents might be keyed by endpoint id and model documents by
slug, while their document bodies retain selected raw JSON rather than a fully rigid schema.

This is close to the state shape in the Area 2 experiment, which uses stable top-level keys before
calling `diff`. The identity and selection envelope would still be explicit, but fields inside a
document could remain opaque until a product needs to understand them.

This representation could support rebuildable historical views such as:

- a field-level Monitor that can include newly observed paths;
- a point-in-time endpoint or model view;
- pricing, capability, and availability projections that select only the paths they understand;
- investigation of when an upstream field first appeared, changed shape, or disappeared.

It does not remove the need for typed product read models. The endpoints grid, public API, pricing
charts, and alert classification each have concrete query and presentation needs. The distinction is
that their schemas could be consumers of a more general temporal representation rather than the
only history that is retained.

### Hybrid forms

The raw and projected boundaries are not mutually exclusive. A system could retain exact raw bundles
at one cadence, emit source-shaped changesets at another, and maintain a separate projected journal
for product entities. It could also use full projected checkpoints for fast product reads while
keeping a different cadence of full raw snapshots for recovery and comparison.

The appropriate division depends on measured compression, replay cost, desired query shapes, and
how much source-shaped detail turns out to be useful.

## Full snapshots as containment

Periodic full snapshots change the risk profile of changesets. A reconstruction does not need to
depend on an unbounded chain from the beginning of history:

```text
full snapshot A -> changeset -> changeset -> ... -> full snapshot B
```

If a changeset is malformed, uses an unsuitable comparison rule, or cannot be applied after a codec
change, the affected interval is bounded by its surrounding full snapshots. The state can be
re-derived from the retained raw observation, and later intervals need not inherit the problem.

Full snapshots also offer natural verification points. A replay can apply intervening changesets and
compare the result with the next stored full snapshot. This can check both forward application and
reverse traversal without assuming that the changeset representation is permanently correct.

The interval is an open tradeoff:

- shorter intervals bound replay work and recovery more tightly, but write more complete data;
- longer intervals may improve delta density, but make reconstruction and diagnosis depend on a
  longer chain;
- different forms may warrant different intervals, such as raw API payloads and product projections.

## Arrays and comparison policy

Array behavior is the main limitation of a schema-free comparison. JSON itself does not say whether
an array is ordered, set-like, keyed, or merely a representation detail.

`json-diff-ts` exposes `embeddedObjKeys` for this purpose:

- `'$value'` can compare a scalar array by member value, which is appropriate for a set-like list
  such as `supported_parameters` when ordering is not meaningful;
- an object key such as `'id'` can match members of an array of records;
- a function or path-specific rule can supply a more specialized identity;
- index comparison remains available where position is meaningful.

These rules can be combined with lightweight heuristics. For example, a comparator might recognize
unique scalar members as a candidate set, recognize consistently keyed objects as a candidate keyed
collection, and fall back to index comparison or whole-array replacement when it cannot establish a
safe interpretation. Such heuristics can improve readability and delta size without making a
complete product schema mandatory.

There are tradeoffs to make visible rather than hide:

- A value-keyed comparison cannot represent duplicate scalar array elements faithfully.
- A heuristic may classify an intentionally ordered list as set-like and suppress a meaningful
  reorder.
- A path-specific policy improves accuracy but becomes part of the representation's versioned
  behavior.
- Treating the whole array as one changed value is larger, but is a simple conservative fallback
  that preserves exact before/after state.

The `output1.txt` reordering illustrates why array policy matters for product presentation. The
same policy may be used for storage, or storage may retain a more literal operation while a derived
Monitor view groups it into a single array-level change.

## Identity, validation, and unknown fields

Schema-free field handling still needs a small amount of structure. A projected document journal
needs to know at least which document changed and how to locate it. For the current catalog shape,
that could mean endpoint id and model slug, plus a crawl identifier and prior-crawl relationship.

This is a much narrower contract than requiring every present field to conform to `CoreEndpoint` or
`CoreModel`. A materializer could, for example, validate that an endpoint has a string id while
preserving additional endpoint properties as JSON. Later product projections would selectively
decode the fields they depend on.

The current Labs pipeline deliberately uses core schemas to select a stable historical product
boundary. A broader document form would therefore need to coexist with that policy rather than
silently redefine it. Useful questions include whether malformed unknown fields should be preserved
as evidence, whether they should prevent a projected document from being accepted, and which fields
remain excluded as volatile observations such as telemetry.

## Storage and query considerations

The daily product database offers an initial comparison point. It occupies 28 MiB for 354 selected
crawls. Its event contexts contain about 13.84 MB of JSON, while before/after field values contain
about 0.86 MB. Ordinary update events repeat full endpoint or model context even when only one small
field changed.

A reversible journal could avoid that specific repetition by retaining complete values for baselines,
additions, removals, and periodic checkpoints, but only changed paths for ordinary updates. This is
a plausible storage benefit, especially at full capture precision, but not a result established by
the existing samples. Retaining arbitrary unknown fields may offset some or all of the reduction.

Query cost is equally important:

- Current-state reads can use a materialized current document cache regardless of how history is
  represented.
- Point-in-time reads can start from the nearest full snapshot or checkpoint and replay in either
  direction.
- Monitor-style history can index crawl, document identity, and touched path without indexing every
  arbitrary JSON value.
- Frequently used product fields can gain dedicated typed indexes only when evidence justifies
  them.

This avoids assuming that every unknown field must immediately become a relational column or an
entity-attribute-value row.

## Integrity and codec lifecycle

Changesets are derived data and should be treated as such. A useful experiment would make their
version and verification state explicit:

- identify the comparison policy and codec version used for a run;
- record predecessor/successor crawl identities;
- calculate canonical document or state hashes before and after application;
- verify that applying a sequence reaches the next retained full snapshot;
- verify that reversing the sequence returns to the previous retained full snapshot;
- retain enough source evidence to rebuild a changeset interval when the codec or policy changes.

The current `json-diff-ts` version is useful for exploring this behavior, including its keyed-array
support. It should not be assumed to be a permanent archival protocol merely because its current
operations can be applied and reverted. The comparison options, path encoding, JSON normalization,
and package version all affect interpretation. A persisted format would need to record or control
those factors.

## Questions for an experiment

The following measurements would help compare the possible boundaries without committing to one:

1. How do compressed full snapshots plus changesets compare with independently compressed full
   bundles at several snapshot intervals?
2. How do source-shaped and projected document changesets differ in changed-path volume, size, and
   usefulness for Monitor investigation?
3. Which array heuristics produce stable, understandable results on historical data, particularly
   `supported_parameters`, modalities, and any arrays of records?
4. How often do a full forward replay and a reverse replay agree with their surrounding full
   snapshots?
5. What are the reconstruction costs for current, recent, and old point-in-time reads at different
   checkpoint intervals?
6. Which product queries benefit from generic path history, and which still clearly need dedicated
   typed projections and indexes?
7. Does retaining unknown projected JSON produce useful schema-evolution evidence, or primarily
   add storage and noise?

Answering these with a bounded historical replay would establish where reversible changesets offer
real value and where ordinary snapshots or specialized product projections remain simpler.
