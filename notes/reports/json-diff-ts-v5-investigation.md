# `json-diff-ts` changeset investigation

## Scope

This report evaluates two `json-diff-ts` representations for ORCA's rewrite:

- the hierarchical `IChange[]` produced by the stable `v4.10.4` release;
- the JSON Atom format provided by the current `v5.0.0-alpha.9` prerelease.

V4's flattened `IAtomicChange[]` representation is not a candidate. It loses structural information
needed to replay some array operations correctly.

The main opportunity is to store occasional full crawl checkpoints and represent intervening crawls
as changesets. This could reduce the size of the historical archive while retaining source-shaped
fields that ORCA does not yet understand deeply. Changesets may also provide a useful basis for
Monitor, schema-evolution analysis, and frontend historical projections.

## Assessment

`json-diff-ts` is a promising foundation for this work. It already solves most of the difficult and
general parts of structural comparison, including nested changes, old/new values, configurable array
identity, path generation, application, and reversal. It has no runtime dependencies, an extensive
test suite, and a small enough implementation for ORCA to understand and fork if necessary.

Both candidate representations can support a forward-only archive chain. V4 hierarchical changesets
are established and preserve the diff engine's native structure. V5 JSON Atom is easier to serialize,
inspect, group, and consume across backend and frontend boundaries. The best choice should be made
from measurements against real ORCA history rather than API shape alone.

The known implementation defects are narrow and testable. The most relevant concern for archival use
is operation ordering for index-addressed arrays. ORCA does not assign meaning to array order and can
avoid most index-addressed operations by declaring stable identities for collection-like paths. A
forward replay check against the known target gives us a simple guard for remaining cases.

Recommended next step:

1. Build a corpus benchmark that generates and replays both v4 hierarchical changesets and v5 atoms.
2. Apply explicit identity rules for known ORCA collections and value sets.
3. Compare compressed size, generation cost, replay cost, and projection ergonomics.
4. Retain full snapshots during the experiment and verify every generated transition.
5. Fork and patch the selected version if the remaining defects intersect ORCA's actual data.

## ORCA's invariants

The assessment should start from the properties of ORCA's data rather than from every value accepted
by the library.

### ORCA owns the JSON boundary

The crawler parses upstream responses, constructs a `CrawlArchiveBundle`, validates it, serializes it
with `JSON.stringify`, and gzip-compresses it in
`packages/backend/convex/snapshots/crawl/main.ts`.

Changesets would therefore operate on JSON values produced by ORCA, not on arbitrary JavaScript
objects or untrusted changeset documents. ORCA can add any envelope metadata, validation, hashes, or
storage policy it needs without requiring those concerns to be built into the diff library.

### Array order is not semantically important

ORCA has no current or historical product requirement in which the order of an upstream array is
meaningful. Arrays represent collections such as models, endpoints, modalities, supported parameters,
datacenters, pricing rules, and capability values.

Ignoring reorder-only changes is desirable. It reduces noise and avoids storing transitions that do
not affect ORCA's interpretation of the data.

This does not mean every array should use the same comparison strategy. The appropriate identity is:

- `$value` for a collection of unique primitive values;
- a stable field such as `id` or `model_id` for a collection of records;
- a resolver function for a record with a compound or nested identity;
- `$index` when no stable identity has been established.

Whole-array replacement is not a built-in identity option. ORCA could choose it in an adapter by
preprocessing that path or replacing a generated subtree when conservative behavior is preferable.

Using `$value` or a record identity intentionally removes ordering from comparison. A reorder then
produces no changeset because the collection has not changed semantically.

### Archive replay is forward-only

An archive would reconstruct a target by starting from a full checkpoint and applying later
changesets in sequence. It does not need to reverse changesets.

Reverse information can still be useful for visualization, interactive history, diagnostics, or
frontend projections. Defects in reverse application should be documented and tested, but they do not
block a forward-only archive if forward replay is correct.

## Candidate representations

| Property             | V4 hierarchical `IChange[]`         | V5 JSON Atom                                                 |
| -------------------- | ----------------------------------- | ------------------------------------------------------------ |
| Status               | Stable `4.10.4`                     | Prerelease `5.0.0-alpha.9`                                   |
| Operations           | `ADD`, `REMOVE`, `UPDATE`           | Generates `add`, `remove`, `replace`; accepts `move`, `copy` |
| Shape                | Nested change tree                  | Flat operation list with paths                               |
| Old values           | Included for updates/removals       | Included by default; optional                                |
| Forward application  | `applyChangeset`                    | `applyAtom`                                                  |
| Reverse application  | `revertChangeset`                   | `invertAtom` and `revertAtom`                                |
| Array identity       | `$index`, `$value`, field, resolver | Same engine and policies                                     |
| Type changes         | Configurable remove/add or update   | Usually `replace`; indexed cases can remain remove/add       |
| Projection use       | Requires traversal or flattening    | Directly filterable/groupable                                |
| Cross-language shape | Library-specific TypeScript format  | Draft JSON Atom specification and Python implementation      |
| Workflow helpers     | None                                | Mapping, stamping, grouping, squashing, extensions           |
| Runtime dependencies | None                                | None                                                         |

## V4 hierarchical changesets

### Representation

V4's `diff` produces a tree. A nested object or array change retains its parent context:

```ts
const changes = [
  {
    type: 'UPDATE',
    key: 'endpoints',
    embeddedKey: 'id',
    changes: [
      {
        type: 'UPDATE',
        key: 'endpoint-id',
        changes: [
          {
            type: 'UPDATE',
            key: 'pricing',
            value: { prompt: '0.2' },
            oldValue: { prompt: '0.1' },
          },
        ],
      },
    ],
  },
]
```

The representation preserves the array's identity rule on its branch. `applyChangeset` can therefore
process related index operations together and order forward removals safely.

### Strengths

- It is the diff engine's native output and does not require a conversion layer.
- It is available in the stable release ORCA already uses.
- Parent branches preserve useful structural context.
- It records complete values for additions/removals and old/new values for updates.
- It supports path-specific identity rules through strings, maps, regular expressions, and resolver
  functions.
- ORCA can serialize the resulting data after generation and wrap it in its own storage envelope.
- The current release includes recent fixes for null, falsy, quoted, and nested identity values.

### Known behavior relevant to ORCA

Forward application works for the ordinary object and identity-keyed collection cases represented in
the package tests. It also correctly orders multiple index-based removals while they remain grouped in
the hierarchical representation.

Reverse application has a confirmed ordering defect when reverting multiple additions to an
index-addressed array:

```ts
const changes = diff(['a'], ['a', 'b', 'c'])
revertChangeset(['a', 'b', 'c'], changes)
// Current result: ['a', 'c']
// Expected result: ['a']
```

The open upstream PR [#412](https://github.com/ltwlf/json-diff-ts/pull/412) contains a focused fix.
This does not affect forward archival replay. If ORCA needs reverse playback for an index-addressed
visualization, the patch is small and can be carried in a fork.

`revertChangeset` also reverses supplied changeset arrays in place, including nested arrays reached
during recursion. A caller that retains or reuses the same in-memory changeset should deep-clone the
generated data first or patch the implementation. Persisted data is not changed unless ORCA writes
the mutated value back.

### Fit for archive storage

V4 hierarchical changesets are a credible archive candidate. Their main tradeoff is ergonomics: a
consumer interested in touched paths must traverse the tree, and frontend projections need either a
shared tree representation or a derived flat form.

The tree may compress well because parent paths are represented once rather than repeated on every
operation. This needs measurement; flat paths may also compress efficiently under gzip.

## V5 JSON Atom

### Representation

V5 exposes a flat JSON-oriented changeset:

```json
{
  "format": "json-atom",
  "version": 1,
  "operations": [
    {
      "op": "replace",
      "path": "$.data[?(@.model_id=='example')].endpoints[?(@.id=='endpoint-id')].pricing",
      "value": { "prompt": "0.2" },
      "oldValue": { "prompt": "0.1" }
    }
  ]
}
```

`diffAtom` generates this representation directly from the same core diff engine. `applyAtom` applies
operations sequentially. `reversible: false` omits old values when they are not useful.

### Strengths

- Flat operations are convenient for filtering, grouping, indexing, transport, and visualization.
- Canonical paths identify exactly which field or collection member changed.
- Ordinary object type changes are represented as `replace`, reducing remove/add pairs; indexed array
  cases can still produce separate operations.
- Envelope and operation extensions can carry ORCA-specific metadata.
- `atomMap`, `atomStamp`, `atomGroupBy`, and `leafProperty` can support projections.
- A draft language-independent specification and Python implementation exist.
- `invertAtom` can derive inverse operations for visualization or interactive history.
- Alpha 9 fixes the forward ordering of multiple index-based removals in generated atoms.

### Known behavior relevant to ORCA

The current alpha passes 413 package tests and builds successfully. Alpha 9 correctly applies multiple
index additions and removals in nested arrays, which is the shape relevant to ORCA's object-rooted
bundles. `invertAtom` reverses operation order before applying an inverse, so nested Atom reversal does
not generally inherit v4's hierarchical ordering defect.

Root arrays have a separate bridge defect. An atom generated from `['a']` to `['a', 'b', 'c']` applies
forward, but reverting it does not restore `['a']`; a generated root-array removal also fails forward.
ORCA's archived root is a `CrawlArchiveBundle` object, so this does not intersect the proposed archive
boundary. It remains relevant if Atom is reused for a frontend state whose root value is an array.

For visualization, ORCA may not need to execute an inverse at all. The generated operations already
contain `value` and `oldValue`, so a UI can show before/after state or directionally invert labels
without reconstructing the previous full document.

The JSON Atom format and API remain prerelease. Development on the default branch has paused since
April 2026, although the repository is not archived and contributor PRs remain active. Because the
implementation is compact and dependency-free, adopting it through an ORCA fork is a practical
option if upstream does not resume.

### Fit for archive storage

JSON Atom is the stronger candidate if one changeset representation should serve archival replay,
change analysis, and frontend/backend projections. Its flat paths are immediately useful beyond
reconstruction.

The main tradeoff is path repetition and reliance on the Atom conversion/application layer in
addition to the core diff engine. The corpus experiment should establish whether those costs are
material.

## Why v4 atomics are excluded

V4's `atomizeChangeset` flattens the hierarchical tree into `IAtomicChange[]`. Applying it requires
`unatomizeChangeset` to rebuild a hierarchy. That round trip does not restore the original grouping of
related array operations.

Confirmed against `v4.10.4`:

```ts
const before = { items: ['a', 'b', 'c'] }
const after = { items: ['a'] }

const changes = diff(before, after)
applyChangeset(structuredClone(before), changes)
// { items: ['a'] }

const atomic = atomizeChangeset(changes)
applyChangeset(structuredClone(before), unatomizeChangeset(atomic))
// { items: ['a', 'c'] }
```

A nested property literally named `a.b` can also be reconstructed at the wrong path after atomization
and unatomization. These are conversion defects, not defects in the corresponding hierarchical
changeset.

There is no reason for ORCA to adopt this intermediate format. V4 hierarchical changesets and v5 JSON
Atom are both better options.

## Array identity in practice

### Identity semantics

When an array is configured with an identity key, the library compares it as a key-value collection.
The selected identity must distinguish members within that array.

For example, the same policy is passed under the version-specific option name:

```ts
const identityPolicy = {
  data: 'model_id',
  'data.endpoints': 'id',
  'data.model.input_modalities': '$value',
  'data.model.output_modalities': '$value',
  'data.endpoints.supported_parameters': '$value',
}

diff(previous, current, { embeddedObjKeys: identityPolicy }) // v4
diffAtom(previous, current, { arrayIdentityKeys: identityPolicy }) // v5
```

The exact paths differ between raw and formatted bundle shapes, but the policy is the same.

### Duplicate identities

A duplicate identity matters only on a path where ORCA has selected identity-based comparison.

Given:

```ts
const values = [
  { id: 'a', price: 1 },
  { id: 'a', price: 2 },
]
```

and identity key `id`, both members occupy the same comparison slot. One shadows the other. Likewise,
`['tools', 'tools']` with `$value` is treated as one set member rather than a multiset containing two
copies.

Identity slots use JavaScript property-key coercion, so numeric `1` and string `'1'` are also the same
identity. Missing selected fields similarly share one slot. ORCA's candidate record identities are
required string IDs, and its sampled `$value` collections contain strings, so duplicate strings are
the practical collision to monitor.

This is appropriate when duplicate members have no semantic meaning. When multiplicity matters, ORCA
should use another identity policy or retain index comparison for that path.

Identity uniqueness can be checked while generating a changeset if desired. A collision can simply
cause that array or entire transition to fall back to a conservative representation.

### Evidence from a real bundle

The available formatted bundle from 2026-08-24 contains:

- 929 top-level model entries with unique `model_id` values;
- 1,231 endpoints with IDs unique within every model's endpoint array;
- 13,884 `supported_parameters` entries with no duplicates within an array;
- no duplicate model input or output modalities;
- no duplicate provider datacenters.

These paths are strong identity-based comparison candidates.

Six endpoint `excluded_parameters` arrays contained a duplicate `response_format` value. ORCA does not
currently configure this path with `$value`. If exclusions are a semantic set, collapsing that
duplicate is desirable. If exact multiplicity is useful evidence, the path can remain index-based.

Other object arrays, such as pricing tiers and schedule windows, do not expose an immediately obvious
universal identity in the sampled bundle. They can initially remain index-based, receive a resolver
after their semantics are understood, or be handled conservatively by an ORCA adapter that replaces
the containing array/subtree.

## Archive design

### Checkpoints and forward transitions

The archive can be represented as:

```text
full checkpoint A -> change B -> change C -> full checkpoint D
```

Reconstructing C loads A and applies B then C. Checkpoint D is independently readable and bounds the
amount of replay required.

The initial experiment should retain every existing full snapshot. Candidate changesets are derived
artifacts until their storage reduction and replay behavior have been established. This allows the
entire corpus to be regenerated after a policy or library patch.

### Storage envelope

ORCA can wrap either candidate representation with the metadata useful to its own pipeline:

```text
crawl_id
parent_crawl_id
checkpoint_crawl_id
representation: v4-change | json-atom
library_version
policy_version
storage_id
compressed_bytes
source_state_hash
target_state_hash
```

The payload should remain in file storage or R2, not in a Convex document. The envelope is an ORCA
contract; it need not be part of `json-diff-ts`.

### Generation and verification

ORCA already loads two adjacent decompressed bundles in
`packages/backend/convex/snapshots/materializedChanges/main.ts`. Changeset generation can use the same
bounded pair-processing shape.

For each candidate transition:

1. Generate the changeset from the previous and current ORCA-produced JSON values.
2. Apply it to a copy of the previous value.
3. Compare the result with the known current value under ORCA's order-insensitive array semantics.
4. Store the changeset only after the comparison succeeds.
5. Fall back to a full checkpoint if generation or verification fails.

This is not compensating for untrusted input. It is a cheap invariant check at the point where ORCA
has both complete states available and can prove that a derived artifact reproduces its target.

Hashes are useful for later replay without retaining both states in memory, but byte-level hashes of
the observed JSON do not match ORCA's order-insensitive semantics. A reorder-only observation creates
no identity-keyed change, so replay deliberately retains the checkpoint's ordering. State hashes must
therefore use the same canonical/order-insensitive representation as comparison, or ORCA can use
semantic equality during generation and reserve hashes for stored-blob integrity. This is an ORCA
implementation choice rather than a requirement imposed on the library.

### Checkpoint policy

Daily and weekly checkpoints should be benchmark dimensions. A practical policy can combine elapsed
time with measured work:

- write a checkpoint after a maximum number of transitions;
- write one when cumulative compressed changes approach a full compressed snapshot;
- write one after changing the identity policy or library fork;
- write one whenever a transition falls back from changeset generation.

The right bounds depend on actual compression and replay timings. Sparse hourly changes may make a
daily or longer interval entirely reasonable.

## Product and frontend opportunities

### Generic historical projections

A source-shaped changeset journal can preserve newly introduced fields without immediately adding
them to every product schema. Typed projections can select the paths they understand while schema
evolution tools inspect unfamiliar paths.

This complements rather than replaces the current strongly typed model, endpoint, and provider views.

### Monitor and alerts

The current `or_views_changes` representation is deliberately lossy and product-specific. It groups
array changes, skips noisy fields, and stores enough before/after state for Monitor, Discord alerts,
and pricing history.

A general changeset journal could become the input to that projection. V5 atoms are especially suited
to this because they already expose flat paths and old/new values. V4 changes can provide the same
information after traversing the tree.

### Frontend replay and visualization

Possible frontend uses include:

- showing field-level before/after values;
- grouping changes by model, endpoint, provider, or path;
- stepping through a bounded entity history;
- rendering additions and removals of set members;
- inspecting unfamiliar fields introduced upstream;
- reconstructing a point-in-time document from a nearby checkpoint.

Most visualizations need operation metadata rather than reverse application. Where interactive reverse
playback is useful, ORCA can test the representation and root shape explicitly and carry the relevant
focused patch if needed.

### Partial histories

Whole-bundle changesets are optimized for archival compression, not necessarily for reading one
endpoint's history. JSON Atom paths make it possible to derive per-entity indexes or projection rows
without making those indexes the source of truth.

An alternative experiment can diff a map of models/endpoints keyed by stable identity. That boundary
may offer more useful partial replay while preserving unknown fields inside each entity document.

## Maintenance and forking

The current stable and alpha releases are zero-dependency TypeScript implementations. The alpha 9
source builds to approximately 63.2 KiB of ESM before compression. Its package suite has 413 passing
tests; v4.10.4 has 109 passing tests.

The v5 development burst ended in April 2026. This increases the likelihood that ORCA would need to
maintain a fork, but the cost appears manageable:

- the core implementation is small and readable;
- defects identified so far have focused fixes and regression tests;
- ORCA needs only a subset of the general API;
- a corpus replay suite can validate upgrades or fork changes against real history;
- the MIT license permits modification and redistribution.

A fork should remain close to upstream and patch only behavior demonstrated to affect ORCA. There is
no need to redesign the changeset model before measurements show a concrete gap.

## Experiment plan

### 1. Build the corpus

Sample adjacent hourly crawls, daily gaps, weekly gaps, unchanged periods, provider churn, endpoint
additions/removals, pricing changes, and upstream shape changes.

### 2. Define the first identity policy

Start with identities supported by observed data:

- model collections by `model_id` or `slug`;
- endpoint collections by `id` or `uuid`;
- modalities, parameters, and datacenters by `$value`;
- other arrays by index until a useful identity is established.

Record identity collisions rather than assuming they cannot occur. The collision log will show whether
fallback behavior is actually needed.

### 3. Compare representations

For v4 hierarchical changes and v5 atoms, measure:

- uncompressed and gzip-compressed changeset size;
- ratio against an independently compressed full snapshot;
- generation and forward-application time;
- peak process memory;
- operation count and path volume;
- percentage of transitions that verify successfully;
- ease of deriving current Monitor-style rows.

### 4. Simulate chains

Measure random reconstruction from daily and weekly checkpoints, including median and worst-case bytes
read, replay time, and memory. Test missing/corrupt artifacts and confirm that damage is contained to
the interval whose reconstruction crosses that artifact; later checkpoints must remain independently
readable.

### 5. Prototype one projection

Derive a small frontend-oriented history, such as endpoint pricing or supported-parameter changes,
from each representation. This will reveal whether JSON Atom's flat paths provide enough additional
value to justify adopting the prerelease or a fork.

### 6. Decide from results

V4 is favored if its tree is materially smaller or simpler and projection traversal is inexpensive.
V5 is favored if sizes are comparable and its flat operations substantially simplify storage,
analysis, or frontend use.

Forking is favored when one representation clearly wins but a small demonstrated defect remains.

## Sources

- Current stable implementation: `repos/json-diff-ts`, tag `v4.10.4`
- Current prerelease implementation: `repos/json-diff-ts`, tag `v5.0.0-alpha.9`
- V4 diff/apply engine: `repos/json-diff-ts/src/jsonDiff.ts`
- V5 Atom implementation: `repos/json-diff-ts/src/jsonAtom.ts`
- JSON Atom draft specification: <https://github.com/ltwlf/json-atom-format>
- Forward index-removal fix: <https://github.com/ltwlf/json-diff-ts/pull/407>
- Open reverse index-array fix: <https://github.com/ltwlf/json-diff-ts/pull/412>
- ORCA archive write path: `packages/backend/convex/snapshots/crawl/main.ts`
- ORCA current adjacent-pair processing: `packages/backend/convex/snapshots/materializedChanges/`
- Sample inspected: `bundles/2026-08-24T14:30:09.259Z.me1.orca.json`
