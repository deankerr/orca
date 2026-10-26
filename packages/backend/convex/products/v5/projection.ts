import { isJsonRecord } from '@orca/json-profile'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import type { JsonValue } from '../../json'
import { CapturedChange } from '../shared/alerts/decode'

/** A path into a catalog entity, the shape shared by current rows, Event snapshots, and Event diffs. */
export type Source = readonly string[]

/** A catalog entity fact at a source path; `undefined` is absent. */
type Fact = JsonValue | undefined

/** ORCA's reading of a field's value, which also decides how its changes are expressed. */
export interface KindValues {
  count: number | null
  flag: boolean | null
  /** A string set: changes are member additions and removals. */
  list: string[] | null
  /** A value too volatile to interpret; changes are announced without their values. */
  opaque: JsonValue
  percent: number
  /** An upstream decimal rate; null when upstream quotes none. */
  price: string | null
  /** Long-form Markdown text. */
  prose: string | null
  text: string | null
}

export type Kind = keyof KindValues

/** One Contract field: the entity path it reads and how its value becomes the field's value. */
export type Field<K extends Kind = Kind> = {
  [P in K]: { kind: P; source: Source; read: (value: Fact) => KindValues[P] }
}[K]

export type Fields = Record<string, Field>

/** A field read from one entity path through its Contract interpretation. */
export function field<K extends Kind>(
  kind: K,
  source: Source,
  schema: z.ZodType<KindValues[K]>,
): Field<K> {
  return { kind, read: (value) => schema.parse(value), source }
}

/** One field's value in a complete entity. */
export type FieldFact<K extends Kind = Kind> = {
  [P in K]: { field: string; kind: P; value: KindValues[P] }
}[K]

function readFact<K extends Kind>(
  name: string,
  definition: Field<K>,
  entity: JsonValue,
): FieldFact<K> {
  return {
    field: name,
    kind: definition.kind,
    value: definition.read(get(entity, definition.source)),
  }
}

/** Every declared field's value in a complete entity, in declaration order. */
export function facts(fields: Fields, entity: JsonValue): FieldFact[] {
  return Object.entries(fields).map(([name, definition]) => readFact(name, definition, entity))
}

function get(value: Fact, path: Source): Fact {
  let current = value

  for (const key of path) {
    if (current === undefined || !isJsonRecord(current)) {
      return undefined
    }

    current = current[key]
  }

  return current
}

/** A Contract entity nested from dotted field paths, before its Contract schema parses it. */
export interface Projection {
  [key: string]: JsonValue
}

/** Translate a complete entity: every declared field, nested by its dotted Contract path. */
export function project(fields: Fields, entity: JsonValue): Projection {
  const output: Projection = {}

  for (const { field: name, value } of facts(fields, entity)) {
    assign(output, name.split('.'), value)
  }

  return output
}

function assign(target: Projection, path: string[], value: JsonValue) {
  const [key, ...rest] = path

  if (key === undefined) {
    return
  }

  if (rest.length === 0) {
    target[key] = value

    return
  }

  const child = target[key]
  const next = child !== undefined && isJsonRecord(child) ? child : {}
  target[key] = next
  assign(next, rest, value)
}

/** A changed entity path with complete values on each side; absent is `undefined`. */
type Leaf = { kind: 'leaf'; path: string[]; before: Fact; after: Fact }

/** A string-set change: members only, neither complete side. */
type Members = { kind: 'members'; path: string[]; added: string[]; removed: string[] }

type Touch = Leaf | Members

/** Stored diffs key string arrays by value, so their changes are member additions and removals. */
const StringSetChange = z.object({
  changes: z.array(z.object({ type: z.enum(['ADD', 'REMOVE']), value: z.string() })),
  embeddedKey: z.literal('$value'),
})

function touches(changes: CapturedChange[], parent: string[] = []): Touch[] {
  return changes.flatMap((change): Touch[] => {
    const path = [...parent, change.key]
    const set = StringSetChange.safeParse(change)

    if (set.success) {
      const members = (type: 'ADD' | 'REMOVE') =>
        set.data.changes.flatMap((item) => (item.type === type ? [item.value] : []))

      return [{ added: members('ADD'), kind: 'members', path, removed: members('REMOVE') }]
    }

    if ('changes' in change) {
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
export type Known = { path: Source; before: JsonValue; after: JsonValue }[]

export type ValueKind = Exclude<Kind, 'list' | 'opaque'>

export type ValueChange<K extends ValueKind = ValueKind> = {
  [P in K]: { field: string; kind: P; before: KindValues[P]; after: KindValues[P] }
}[K]

/**
 * A Contract field change: complete sides, added and removed members of a string set, or an opaque
 * field that changed without values.
 */
type FieldChange =
  | ValueChange
  | { field: string; kind: 'list'; added: string[]; removed: string[] }
  | { field: string; kind: 'opaque' }

export type Translation = {
  changes: FieldChange[]
  /**
   * Non-opaque Contract fields whose source changed, but whose complete sides the change does
   * not supply.
   */
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

function valueChange<K extends ValueKind>(
  name: string,
  definition: Field<K>,
  before: Fact,
  after: Fact,
): ValueChange<K> {
  return {
    after: definition.read(after),
    before: definition.read(before),
    field: name,
    kind: definition.kind,
  }
}

/** A touched opaque source without both sides still changed; its values are never announced. */
function opaqueChanged(
  definition: Field<'opaque'>,
  before: { value: Fact } | undefined,
  after: { value: Fact } | undefined,
): boolean {
  return (
    before === undefined ||
    after === undefined ||
    !isDeepEqual(definition.read(before.value), definition.read(after.value))
  )
}

const members = (from: readonly string[], to: readonly string[]) =>
  to.filter((item) => !from.includes(item))

/** Translate an entity change through the same field declarations as complete entities. */
function translate(fields: Fields, changes: CapturedChange[], known: Known = []): Translation {
  const touched = touches(changes)
  const leaves = touched.filter((touch): touch is Leaf => touch.kind === 'leaf')
  const result: Translation = { changes: [], ignored: [], unresolved: [] }

  for (const [name, definition] of Object.entries(fields)) {
    const relevant = touched.filter((touch) => related(definition.source, touch.path))
    const [set] = relevant

    if (relevant.length === 0) {
      continue
    }

    if (definition.kind === 'list' && relevant.length === 1 && set?.kind === 'members') {
      if (set.added.length > 0 || set.removed.length > 0) {
        result.changes.push({ added: set.added, field: name, kind: 'list', removed: set.removed })
      }

      continue
    }

    const before = sourceValue(definition.source, 'before', leaves, known)
    const after = sourceValue(definition.source, 'after', leaves, known)

    if (definition.kind === 'opaque') {
      if (opaqueChanged(definition, before, after)) {
        result.changes.push({ field: name, kind: 'opaque' })
      }

      continue
    }

    if (before === undefined || after === undefined) {
      result.unresolved.push(name)
      continue
    }

    if (definition.kind === 'list') {
      const from = definition.read(before.value) ?? []
      const to = definition.read(after.value) ?? []
      const [added, removed] = [members(from, to), members(to, from)]

      if (added.length > 0 || removed.length > 0) {
        result.changes.push({ added, field: name, kind: 'list', removed })
      }

      continue
    }

    const change = valueChange(name, definition, before.value, after.value)

    if (!isDeepEqual(change.before, change.after)) {
      result.changes.push(change)
    }
  }

  result.ignored = touched
    .filter((touch) => !Object.values(fields).some(({ source }) => related(source, touch.path)))
    .map((touch) => touch.path.join('.'))

  return result
}

const CapturedUpdate = z.object({ changes: z.array(CapturedChange) })

/** Translate a stored UPDATE's serialized entity-root diff. */
export function translateStored(fields: Fields, changeJson: string, known: Known = []) {
  return translate(fields, CapturedUpdate.parse(JSON.parse(changeJson)).changes, known)
}
