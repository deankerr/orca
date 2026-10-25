import { isDeepEqual, isPlainObject } from 'remeda'
import type { z } from 'zod'

import type { CapturedChange } from '../shared/alerts/decode'

/** A path into a catalog entity, the shape shared by current rows, Event snapshots, and Event diffs. */
export type Source = readonly string[]

/** One Contract field: the entity paths it reads and how their values become its value. */
export type Field = {
  sources: readonly Source[]
  read: (...values: unknown[]) => unknown
  /** String-set fields can translate member changes without either complete side. */
  set?: true
}

export type Fields = Record<string, Field>

/** A field read from one entity path through its Contract interpretation. */
export function field(source: Source, schema: z.ZodType, options: { set?: true } = {}): Field {
  return { read: (value) => schema.parse(value), sources: [source], ...options }
}

function get(value: unknown, path: Source): unknown {
  let current = value
  for (const key of path) {
    if (!isPlainObject(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

/** Translate a complete entity: every declared field, nested by its dotted Contract path. */
export function project(fields: Fields, entity: unknown): Record<PropertyKey, unknown> {
  const output: Record<PropertyKey, unknown> = {}

  for (const [path, { read, sources }] of Object.entries(fields)) {
    assign(output, path.split('.'), read(...sources.map((source) => get(entity, source))))
  }

  return output
}

function assign(target: Record<PropertyKey, unknown>, path: string[], value: unknown) {
  const [key, ...rest] = path
  if (key === undefined) {
    return
  }
  if (rest.length === 0) {
    target[key] = value
    return
  }
  const child = target[key]
  const next = isPlainObject(child) ? child : {}
  target[key] = next
  assign(next, rest, value)
}

/** A changed entity path with complete values on each side; absent is `undefined`. */
type Leaf = { kind: 'leaf'; path: string[]; before: unknown; after: unknown }
/** A string-set change: members only, neither complete side. */
type Members = { kind: 'members'; path: string[]; added: string[]; removed: string[] }
type Touch = Leaf | Members

function touches(changes: CapturedChange[], parent: string[] = []): Touch[] {
  return changes.flatMap((change): Touch[] => {
    const path = [...parent, change.key]

    if (change.embeddedKey === '$value' && change.changes !== undefined) {
      const members = (type: string) =>
        change.changes?.flatMap((item) =>
          item.type === type && typeof item.value === 'string' ? [item.value] : [],
        ) ?? []
      return [{ added: members('ADD'), kind: 'members', path, removed: members('REMOVE') }]
    }
    if (change.changes !== undefined) {
      return touches(change.changes, path)
    }
    if (change.type === 'ADD') {
      return [{ after: change.value, before: undefined, kind: 'leaf', path }]
    }
    if (change.type === 'REMOVE') {
      return [{ after: undefined, before: change.value, kind: 'leaf', path }]
    }
    return [{ after: change.value, before: change.oldValue, kind: 'leaf', path }]
  })
}

const startsWith = (path: readonly string[], prefix: readonly string[]) =>
  prefix.length <= path.length && prefix.every((key, index) => path[index] === key)

const related = (a: readonly string[], b: readonly string[]) => startsWith(a, b) || startsWith(b, a)

/** Complete values for some entity paths, supplied alongside a change, such as an Event's pricing. */
export type Known = { path: Source; before: unknown; after: unknown }[]

type FieldChange =
  | { field: string; before: unknown; after: unknown }
  | { field: string; added: string[]; removed: string[] }

export type Translation = {
  changes: FieldChange[]
  /** Contract fields whose sources changed, but whose complete sides the change does not supply. */
  unresolved: string[]
  /** Changed entity paths that no Contract field reads. */
  ignored: string[]
}

type Side = 'before' | 'after'

function sourceValue(source: Source, side: Side, leaves: Leaf[], known: Known) {
  const covering = leaves.find((leaf) => startsWith(source, leaf.path))
  if (covering !== undefined) {
    return { value: get(covering[side], source.slice(covering.path.length)) }
  }
  const supplied = known.find((entry) => startsWith(source, entry.path))
  if (supplied !== undefined) {
    return { value: get(supplied[side], source.slice(supplied.path.length)) }
  }
  return undefined
}

/** Translate an entity change through the same field declarations as complete entities. */
export function translate(
  fields: Fields,
  changes: CapturedChange[],
  known: Known = [],
): Translation {
  const touched = touches(changes)
  const leaves = touched.filter((touch): touch is Leaf => touch.kind === 'leaf')
  const result: Translation = { changes: [], ignored: [], unresolved: [] }

  for (const [name, definition] of Object.entries(fields)) {
    const relevant = touched.filter((touch) =>
      definition.sources.some((source) => related(source, touch.path)),
    )
    if (relevant.length === 0) {
      continue
    }

    const [members] = relevant
    if (definition.set && relevant.length === 1 && members?.kind === 'members') {
      if (members.added.length > 0 || members.removed.length > 0) {
        result.changes.push({ added: members.added, field: name, removed: members.removed })
      }
      continue
    }

    const sides = (['before', 'after'] as const).map((side) =>
      definition.sources.map((source) => sourceValue(source, side, leaves, known)),
    )
    if (sides.flat().some((value) => value === undefined)) {
      result.unresolved.push(name)
      continue
    }

    const [before, after] = sides.map((values) =>
      definition.read(...values.map((entry) => entry?.value)),
    )
    if (!isDeepEqual(before, after)) {
      result.changes.push({ after, before, field: name })
    }
  }

  result.ignored = touched
    .filter(
      (touch) =>
        !Object.values(fields).some(({ sources }) =>
          sources.some((source) => related(source, touch.path)),
        ),
    )
    .map((touch) => touch.path.join('.'))

  return result
}
