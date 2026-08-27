// oxlint-disable sort-keys -- Property order is part of the serialized JSON profile format.

export type JsonPrimitive = boolean | null | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonRecord = Record<string, JsonValue>

export type JsonType = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string'

export interface JsonProfile {
  profile_format: 'json-record-profile-v1'
  record_count: number
  root: ValueProfile
}

export interface ValueProfile {
  path: string
  population: number
  types: JsonTypeProfile[]
}

export interface FieldProfile extends ValueProfile {
  name: string
  none: number
}

export type JsonTypeProfile = ArrayProfile | NullProfile | ObjectProfile | PrimitiveProfile

export interface NullProfile {
  type: 'null'
  count: number
}

export interface PrimitiveProfile {
  type: 'boolean' | 'number' | 'string'
  count: number
  values: Array<{ value: Exclude<JsonPrimitive, null>; count: number }>
}

export interface ObjectProfile {
  type: 'object'
  count: number
  key_sets: Array<{ keys: string[]; count: number }>
  fields: FieldProfile[]
}

export interface ArrayProfile {
  type: 'array'
  count: number
  lengths: Array<{ length: number; count: number }>
  items: ValueProfile
}

interface MutableValueProfile {
  occurrences: number
  path: string
  types: Map<JsonType, MutableTypeProfile>
}

type MutableTypeProfile =
  | MutableArrayProfile
  | MutableNullProfile
  | MutableObjectProfile
  | MutablePrimitiveProfile

interface MutableNullProfile {
  count: number
  type: 'null'
}

interface MutablePrimitiveProfile {
  count: number
  type: 'boolean' | 'number' | 'string'
  values: Map<Exclude<JsonPrimitive, null>, number>
}

interface MutableObjectProfile {
  count: number
  fields: Map<string, MutableValueProfile>
  keySets: Map<string, { count: number; keys: string[] }>
  path: string
  type: 'object'
}

interface MutableArrayProfile {
  count: number
  items: MutableValueProfile
  lengths: Map<number, number>
  type: 'array'
}

const JSON_TYPE_ORDER: JsonType[] = ['null', 'boolean', 'number', 'string', 'object', 'array']

/**
 * Profiles a population of JSON objects without inferring or enforcing a schema.
 * The records must contain only values produced by parsing JSON.
 */
export function profileJsonRecords(records: readonly JsonRecord[]): JsonProfile {
  const root = createValueProfile('$[*]')

  for (const record of records) {
    observeValue(root, record)
  }

  return {
    profile_format: 'json-record-profile-v1',
    record_count: records.length,
    root: finalizeValue(root, records.length),
  }
}

function createValueProfile(path: string): MutableValueProfile {
  return {
    occurrences: 0,
    path,
    types: new Map(),
  }
}

function observeValue(profile: MutableValueProfile, value: JsonValue): void {
  profile.occurrences += 1

  if (value === null) {
    getOrCreateNull(profile).count += 1
    return
  }

  if (typeof value === 'boolean') {
    const typeProfile = getOrCreatePrimitive(profile, 'boolean')
    typeProfile.count += 1
    observePrimitive(typeProfile, value)
    return
  }

  if (typeof value === 'number') {
    const typeProfile = getOrCreatePrimitive(profile, 'number')
    typeProfile.count += 1
    observePrimitive(typeProfile, value)
    return
  }

  if (typeof value === 'string') {
    const typeProfile = getOrCreatePrimitive(profile, 'string')
    typeProfile.count += 1
    observePrimitive(typeProfile, value)
    return
  }

  if (Array.isArray(value)) {
    const typeProfile = getOrCreateArray(profile)
    typeProfile.count += 1
    observeArray(typeProfile, value)
    return
  }

  const typeProfile = getOrCreateObject(profile)
  typeProfile.count += 1
  observeObject(typeProfile, value)
}

function observePrimitive(
  profile: MutablePrimitiveProfile,
  value: Exclude<JsonPrimitive, null>,
): void {
  increment(profile.values, value)
}

function observeArray(profile: MutableArrayProfile, value: JsonValue[]): void {
  increment(profile.lengths, value.length)
  for (const item of value) {
    observeValue(profile.items, item)
  }
}

function observeObject(profile: MutableObjectProfile, value: JsonRecord): void {
  const keys = Object.keys(value).toSorted(compareStrings)
  const keySetIdentity = JSON.stringify(keys)
  const keySet = profile.keySets.get(keySetIdentity) ?? { count: 0, keys }
  keySet.count += 1
  profile.keySets.set(keySetIdentity, keySet)

  for (const key of keys) {
    const field = profile.fields.get(key) ?? createValueProfile(appendField(profile, key))
    const fieldValue = value[key]
    if (fieldValue === undefined) {
      throw new TypeError('JSON object properties cannot contain undefined')
    }
    observeValue(field, fieldValue)
    profile.fields.set(key, field)
  }
}

function getOrCreateNull(profile: MutableValueProfile): MutableNullProfile {
  const existing = profile.types.get('null')
  if (existing?.type === 'null') {
    return existing
  }
  const created: MutableNullProfile = { count: 0, type: 'null' }
  profile.types.set('null', created)
  return created
}

function getOrCreatePrimitive(
  profile: MutableValueProfile,
  type: MutablePrimitiveProfile['type'],
): MutablePrimitiveProfile {
  const existing = profile.types.get(type)
  if (existing?.type === 'boolean' || existing?.type === 'number' || existing?.type === 'string') {
    return existing
  }
  const created: MutablePrimitiveProfile = { count: 0, type, values: new Map() }
  profile.types.set(type, created)
  return created
}

function getOrCreateObject(profile: MutableValueProfile): MutableObjectProfile {
  const existing = profile.types.get('object')
  if (existing?.type === 'object') {
    return existing
  }
  const created: MutableObjectProfile = {
    count: 0,
    fields: new Map(),
    keySets: new Map(),
    path: profile.path,
    type: 'object',
  }
  profile.types.set('object', created)
  return created
}

function getOrCreateArray(profile: MutableValueProfile): MutableArrayProfile {
  const existing = profile.types.get('array')
  if (existing?.type === 'array') {
    return existing
  }
  const created: MutableArrayProfile = {
    count: 0,
    items: createValueProfile(`${profile.path}[*]`),
    lengths: new Map(),
    type: 'array',
  }
  profile.types.set('array', created)
  return created
}

function finalizeValue(profile: MutableValueProfile, population: number): ValueProfile {
  return {
    path: profile.path,
    population,
    types: finalizeTypes(profile),
  }
}

function finalizeField(name: string, field: MutableValueProfile, population: number): FieldProfile {
  return {
    name,
    path: field.path,
    population,
    none: population - field.occurrences,
    types: finalizeTypes(field),
  }
}

function finalizeTypes(profile: MutableValueProfile): JsonTypeProfile[] {
  return JSON_TYPE_ORDER.flatMap((type) => {
    const typeProfile = profile.types.get(type)
    return typeProfile === undefined ? [] : [finalizeType(typeProfile)]
  })
}

function finalizeType(profile: MutableTypeProfile): JsonTypeProfile {
  if (profile.type === 'object') {
    return {
      type: profile.type,
      count: profile.count,
      key_sets: [...profile.keySets.entries()]
        .toSorted(([left], [right]) => compareStrings(left, right))
        .map(([, { count, keys }]) => ({ keys, count })),
      fields: [...profile.fields.entries()]
        .toSorted(([left], [right]) => compareStrings(left, right))
        .map(([name, field]) => finalizeField(name, field, profile.count)),
    }
  }

  if (profile.type === 'array') {
    return {
      type: profile.type,
      count: profile.count,
      lengths: [...profile.lengths.entries()]
        .toSorted(([left], [right]) => left - right)
        .map(([length, count]) => ({ length, count })),
      items: finalizeValue(profile.items, profile.items.occurrences),
    }
  }

  if (profile.type === 'null') {
    return { type: profile.type, count: profile.count }
  }

  return {
    type: profile.type,
    count: profile.count,
    values: [...profile.values.entries()]
      .toSorted(([left], [right]) => comparePrimitives(left, right))
      .map(([value, count]) => ({ value, count })),
  }
}

function appendField(profile: MutableObjectProfile, key: string): string {
  return `${profile.path}[${JSON.stringify(key)}]`
}

function increment<Key>(counts: Map<Key, number>, key: Key): void {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

function comparePrimitives(
  left: Exclude<JsonPrimitive, null>,
  right: Exclude<JsonPrimitive, null>,
): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right)
  }
  return compareStrings(String(left), String(right))
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  return left > right ? 1 : 0
}
