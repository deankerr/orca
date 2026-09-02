# `json-diff-ts` v5 Alpha 9 findings

## Scope

This note records the behavior of the exact published `json-diff-ts@5.0.0-alpha.9` package that is
relevant to reversible ORCA bundle transitions. It distinguishes the v5 JSON Atom API from the
legacy hierarchical and flattened changeset APIs that remain exported for compatibility.

The findings come from the published package's declarations, README, bundled source map, and small
reproduction cases against its built ESM entry point. Source links below are pinned to the upstream
`v5.0.0-alpha.9` tag.

## Assessment

Use `diffAtom` to generate the persisted representation, but do not use Alpha 9's `applyAtom` and
`revertAtom` unmodified for ORCA replay. JSON Atom is a plain, flat, JSON-serializable envelope whose
operations retain the values needed for reversal by default. It is more suitable for a persisted
experiment than the legacy `atomizeChangeset` output, and it avoids a lossy conversion step when
generated directly with `diffAtom`. The corpus experiment retains that raw Atom and uses a small ORCA
application adapter for the defects described below.

For the current bundle shape, the initial identity policy should be:

```ts
const arrayIdentityKeys = {
  data: 'model_id',
  'data.endpoints': 'id',
}
```

These are the only collections whose unordered meaning is established for this experiment. Other
arrays stay index-based until ORCA explicitly establishes a stable identity or deliberately replaces
the whole array.

## Reversible JSON Atom operations

`diffAtom` emits a `{ format: 'json-atom', version: 1, operations: [...] }` document. Additions carry
`value`, removals carry `oldValue`, and replacements carry both `value` and `oldValue`. A newly added
or removed model, endpoint, object, or unknown subtree is therefore embedded whole rather than
requiring a schema for its internal fields. Passing `reversible: false` omits `oldValue` from removes
and replacements. [Alpha 9 producer](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts#L130-L143),
[leaf operation generation](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts#L309-L337)

`applyAtom` validates the envelope, then processes operations sequentially. It normally mutates the
provided object, so callers should apply to `structuredClone(source)` and must always use the return
value because a root replacement can return a different value. `invertAtom` reverses operation order,
maps add/remove pairs, and swaps replace values; `revertAtom` applies that inverse. Inversion throws if
a remove or replace lacks `oldValue`. [Apply and revert](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts#L723-L837),
[inversion](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts#L608-L670)

The embedded operation values are not defensively cloned. A generated Atom initially references the
same added/removed/replaced objects as its inputs, and applying a keyed addition pushes that same
`value` reference into the destination array. Serializing the Atom immediately, or cloning it before
later mutations, prevents an in-memory source or replay result from silently changing retained Atom
values. A persisted JSON round trip naturally breaks those references.

Application is not conditional. The library does not assert that the current value equals
`oldValue`, nor that the atom was generated from the supplied source. Applying a valid atom to the
wrong checkpoint can silently produce a result. ORCA should therefore keep predecessor/target hashes
or equivalent semantic verification outside the atom.

## Array identity and order

`arrayIdentityKeys` is the v5 name for `embeddedObjKeys`; the old option remains as a deprecated
alias. A record, `Map`, regular-expression path rule, or resolver function can select the identity.
Arrays default to `$index`; `$value` treats primitive members as identities. The diff engine converts
each array into an object keyed by the selected identity before comparing it. [Option normalization](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonDiff.ts#L49-L72),
[array comparison](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonDiff.ts#L566-L643)

With `data: 'model_id'` and `data.endpoints: 'id'`, model and endpoint reorders emit no operation.
Likewise, `$value` suppresses reorder-only changes in a primitive collection. This matches ORCA's
semantics, but it intentionally does not reconstruct the target's array order. Forward replay retains
the source ordering for existing members and appends keyed additions. Verification must compare under
the same order-insensitive policy rather than using byte equality or ordinary `JSON.stringify`
equality.

Identity is a caller-owned invariant:

- duplicate IDs collapse to one comparison slot;
- missing IDs share the same `undefined` slot;
- JavaScript property-key coercion means numeric `1` and string `'1'` collide while building the
  comparison map;
- `$value` is set-like, not multiset-like, so duplicate primitive values collapse too.

Alpha 9 does not report these collisions. The generator should validate uniqueness for every path
where it selects key or value identity and fall back to a conservative representation when the
invariant fails. ORCA's model and endpoint identifiers are strings, which avoids mixed-type identity
collisions if that boundary is enforced.

Atom filter paths preserve primitive identity types. String identities are single-quoted with doubled
quote escaping; numbers, booleans, and `null` use typed literals. Object or array identities are not
supported filter literals. [Literal codec](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/atomPath.ts#L10-L44),
[path parser and builder](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/atomPath.ts#L135-L245)

## Serialization and parsing

There is no special whole-Atom serializer or parser: an Atom is a plain object intended for ordinary
`JSON.stringify` and `JSON.parse`. The package's parser/builder functions operate on Atom paths:
`parseAtomPath`, `buildAtomPath`, `parseFilterLiteral`, and `formatFilterLiteral`. The separately
exported `comparisonToDict` and `comparisonToFlatList` functions serialize the enriched result of
`compare`; those are presentation/projection helpers, not replayable Atom codecs.

`validateAtom` is structural rather than a complete archival validator. It checks the envelope and
operation field shapes, but Alpha 9 accepts any numeric `version`, does not parse each path, does not
require reversibility fields, does not reject dangerous property keys such as `__proto__`, and does
not verify the operation against a source document.
[Validator implementation](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts#L46-L122)
Persisted input should therefore also enforce version `1`, parse paths, require `oldValue` where
reversal is expected, and verify the transition against its known source and target.

## Legacy bridges and atomization

The legacy `diff` API returns a hierarchical `IChange[]`. `atomizeChangeset` flattens that tree to
`IAtomicChange[]`, and `unatomizeChangeset` rebuilds one branch per atomic operation. That round trip
does not necessarily recover the original grouping and operation-order behavior.

Alpha 9 reproduces this failure:

```ts
const source = { items: ['a', 'b', 'c'] }
const target = { items: ['a'] }
const changes = diff(source, target)

applyChangeset(structuredClone(source), changes)
// { items: ['a'] }

applyChangeset(structuredClone(source), unatomizeChangeset(atomizeChangeset(changes)))
// { items: ['a', 'c'] }
```

The original hierarchy groups both index removals, allowing the apply path to sort descending. The
rehydrated form creates separate branches and shifts the second index after the first removal.
[Legacy atomize/unatomize](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonDiff.ts#L145-L335),
[index removal ordering](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonDiff.ts#L725-L776)

`toAtom` is also documented as a best-effort bridge: it always string-quotes filter literals, so a
numeric identity can lose canonical typing. `fromAtom` returns legacy atomics, cannot convert `move`
or `copy`, and still requires `unatomizeChangeset` before legacy application. Generate canonical Atom
data directly with `diffAtom`; do not persist legacy flattened atomics as the archive format.
[Bridge implementation](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts#L475-L598)

## Alpha 9 caveats to keep in the corpus tests

- The corpus and focused reproductions exposed three Atom application defects relevant to ORCA:
  bracket-quoted properties are assigned at the wrong location, a non-root replacement cannot be
  reverted to an `oldValue` of `null`, and replacing a complete keyed-array member is a no-op. The
  experiment uses `parseAtomPath` in a narrow add/remove/replace adapter while leaving `diffAtom`
  output unchanged.
- Root arrays remain defective in the Atom-to-legacy application bridge. A generated transition from
  `['a', 'b', 'c']` to `['a']` is a no-op when applied, and reverting a generated root-array addition
  does not remove the added values. ORCA's bundle root is an object and `data` is nested, so this does
  not directly intersect the proposed boundary, but a regression test should pin that assumption.
- `applyAtom` mutates nested containers, and the legacy `revertChangeset` implementation also reverses
  supplied changeset arrays in place. Treat stored payloads as immutable and clone before use.
- Index-addressed arrays remain sensitive to operation grouping and shifts. Alpha 9 orders multiple
  generated Atom removals descending, but keyed identities or whole-array fallback remain safer for
  semantically unordered ORCA collections.
- The release is an alpha. Persist the library version and ORCA identity-policy version with derived
  data, retain full bundle evidence, and verify forward/reverse replay at checkpoint boundaries.

## Recommended experiment contract

For every adjacent transition, record the source bundle identity, target bundle identity, package
version, identity-policy version, Atom, and semantic hashes. Derive sizes, operation summaries, and
checkpoint scenarios afterward from the persisted files rather than duplicating them into each
envelope. Accept an Atom only after
forward application is semantically equal to the target and reverse application is semantically equal
to the source. Array order should be canonicalized or ignored consistently for `data` and `endpoints`.
Any identity collision, apply error, mismatch, or unsupported root
shape should fall back to a full checkpoint while retaining the original bundle.

## Primary sources

- [Published Alpha 9 package metadata](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/package.json)
- [Alpha 9 README and API guide](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/README.md)
- [Alpha 9 JSON Atom implementation](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonAtom.ts)
- [Alpha 9 diff/apply implementation](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/jsonDiff.ts)
- [Alpha 9 path codec](https://github.com/ltwlf/json-diff-ts/blob/v5.0.0-alpha.9/src/atomPath.ts)
- [JSON Atom draft specification](https://github.com/ltwlf/json-atom-format)
