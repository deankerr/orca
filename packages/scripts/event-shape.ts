import { deepStrictEqual } from 'node:assert'

import { applyChangeset, diff, revertChangeset } from 'json-diff-ts'

const options = { treatTypeChangeAsReplace: false }
const before = [
  {
    id: 'updated',
    metadata: { quantization: 'fp8' },
    pricing: { discount: 0, meters: { prompt: '0.000002' } },
  },
  { id: 'removed', pricing: { discount: 0, meters: { prompt: '0' } } },
  { id: 'unchanged' },
]
const after = [
  { id: 'added', pricing: { discount: 0, meters: { prompt: '0.000003' } } },
  {
    id: 'updated',
    metadata: { quantization: 'bf16' },
    pricing: { discount: 0, meters: { prompt: '0.000001' } },
  },
  { id: 'unchanged' },
]

const previous = Object.fromEntries(before.map((entity) => [entity.id, entity]))
const next = Object.fromEntries(after.map((entity) => [entity.id, entity]))
const changes = diff(previous, next, options)

deepStrictEqual(
  changes.map(({ key, type }) => [key, type]),
  [
    ['updated', 'UPDATE'],
    ['added', 'ADD'],
    ['removed', 'REMOVE'],
  ],
)
deepStrictEqual(applyChangeset(structuredClone(previous), structuredClone(changes)), next)
// Reverting also reverses the changeset arrays in place.
deepStrictEqual(revertChangeset(structuredClone(next), structuredClone(changes)), previous)

// Matching array items by identity produces the same entity nodes, regardless of order.
const arrayOptions = { embeddedObjKeys: { endpoints: 'id' }, ...options }
const arrayChanges = diff({ endpoints: before }, { endpoints: after }, arrayOptions)
deepStrictEqual(arrayChanges[0]?.changes, changes)
deepStrictEqual(diff({ endpoints: after }, { endpoints: after.toReversed() }, arrayOptions), [])

// The same nodes can be generated one entity at a time while preserving the identity wrapper.
for (const change of changes) {
  const { key } = change
  deepStrictEqual(
    diff(
      Object.hasOwn(previous, key) ? { [key]: previous[key] } : {},
      Object.hasOwn(next, key) ? { [key]: next[key] } : {},
      options,
    ),
    [change],
  )
}

// Entity presence survives even when its body is empty or its last field disappears.
deepStrictEqual(diff({}, { empty: {} }, options), [{ key: 'empty', type: 'ADD', value: {} }])
deepStrictEqual(diff({ empty: {} }, {}, options), [{ key: 'empty', type: 'REMOVE', value: {} }])
deepStrictEqual(diff({ entity: { label: 'old' } }, { entity: {} }, options)[0]?.type, 'UPDATE')

// In 4.10.4 the diff retains an UPDATE to null, but applyChangeset skips that leaf.
const nullBefore = { entity: { quantization: 'fp8' } }
const nullAfter = { entity: { quantization: null } }
const nullChanges = diff(nullBefore, nullAfter, options)
const appliedNull: unknown = applyChangeset(structuredClone(nullBefore), nullChanges)
deepStrictEqual(nullChanges[0]?.changes, [
  { key: 'quantization', oldValue: 'fp8', type: 'UPDATE', value: null },
])

console.log(
  JSON.stringify(
    {
      changes,
      nullUpdate: {
        applied: appliedNull,
        changes: nullChanges,
        expected: nullAfter,
      },
    },
    null,
    2,
  ),
)
