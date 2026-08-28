import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { diffAtom, invertAtom, parseAtomPath } from 'json-diff-ts'
import type { AtomPathSegment, IAtomOperation, IJsonAtom } from 'json-diff-ts'

import type { ModelEndpointsV1 } from '../model-endpoints-v1.ts'

export const ARRAY_IDENTITY_POLICY = {
  data: 'model_id',
  'data.endpoints': 'id',
} as const

export const SEMANTICS_VERSION = 'orca-model-endpoint-collections-v1'

export function normalizeBundleCollections(bundle: ModelEndpointsV1): ModelEndpointsV1 {
  bundle.data.sort((left, right) => left.model_id.localeCompare(right.model_id))
  for (const entry of bundle.data) {
    entry.endpoints?.sort((left, right) => left.id.localeCompare(right.id))
  }
  return bundle
}

export function assertUniqueCollectionIdentities(bundle: ModelEndpointsV1, source: string): void {
  const modelIds = new Set<string>()
  for (const entry of bundle.data) {
    if (modelIds.has(entry.model_id)) {
      throw new Error(`Duplicate model_id ${entry.model_id} in ${source}.`)
    }
    modelIds.add(entry.model_id)

    const endpointIds = new Set<string>()
    for (const endpoint of entry.endpoints ?? []) {
      if (endpointIds.has(endpoint.id)) {
        throw new Error(
          `Duplicate endpoint id ${endpoint.id} for model ${entry.model_id} in ${source}.`,
        )
      }
      endpointIds.add(endpoint.id)
    }
  }
}

export function createReversibleAtom(before: unknown, after: unknown): IJsonAtom {
  return diffAtom(before, after, { arrayIdentityKeys: ARRAY_IDENTITY_POLICY })
}

export function applyReversibleAtom(source: unknown, atom: IJsonAtom): unknown {
  return applyOperations(structuredClone(source), atom.operations)
}

export function revertReversibleAtom(target: unknown, atom: IJsonAtom): unknown {
  return applyOperations(structuredClone(target), invertAtom(atom).operations)
}

export function semanticHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortObjectKeys(value)))
    .digest('hex')
}

export function semanticallyEqual(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right)
}

function applyOperations(source: unknown, operations: readonly IAtomOperation[]): unknown {
  let result = source
  for (const operation of operations) {
    if (operation.op === 'move' || operation.op === 'copy') {
      throw new Error(`ORCA archive replay does not accept ${operation.op} operations.`)
    }
    result = applyOperation(result, operation)
  }
  return result
}

function applyOperation(root: unknown, operation: IAtomOperation): unknown {
  const segments = parseAtomPath(operation.path)
  if (segments.length === 1) {
    return applyRootOperation(operation)
  }

  const leaf = segments.at(-1)
  if (leaf === undefined || leaf.type === 'root') {
    throw new Error(`Invalid non-root Atom path: ${operation.path}`)
  }
  let parent = root
  for (const segment of segments.slice(1, -1)) {
    parent = resolveSegment(parent, segment, operation.path)
  }
  applyLeafOperation(parent, leaf, operation)
  return root
}

function applyRootOperation(operation: IAtomOperation): unknown {
  if (operation.op === 'remove') {
    return null
  }
  return cloneJsonValue(operation.value)
}

function applyLeafOperation(
  parent: unknown,
  leaf: Exclude<AtomPathSegment, { type: 'root' }>,
  operation: IAtomOperation,
): void {
  switch (leaf.type) {
    case 'property': {
      const record = requireRecord(parent, operation.path)
      if (operation.op === 'remove') {
        Reflect.deleteProperty(record, leaf.name)
      } else {
        record[leaf.name] = cloneJsonValue(operation.value)
      }
      break
    }
    case 'index': {
      const array = requireArray(parent, operation.path)
      if (operation.op === 'add') {
        array.splice(leaf.index, 0, cloneJsonValue(operation.value))
      } else if (operation.op === 'remove') {
        requireArrayIndex(array, leaf.index, operation.path)
        array.splice(leaf.index, 1)
      } else {
        requireArrayIndex(array, leaf.index, operation.path)
        array[leaf.index] = cloneJsonValue(operation.value)
      }
      break
    }
    case 'keyFilter': {
      applyFilteredOperation(
        requireArray(parent, operation.path),
        (value) => filterPropertyMatches(value, leaf),
        operation,
      )
      break
    }
    case 'valueFilter': {
      applyFilteredOperation(
        requireArray(parent, operation.path),
        (value) => isDeepStrictEqual(value, leaf.value),
        operation,
      )
      break
    }
    default: {
      throw new Error(`Unsupported Atom leaf segment: ${operation.path}`)
    }
  }
}

function applyFilteredOperation(
  array: unknown[],
  matches: (value: unknown) => boolean,
  operation: IAtomOperation,
): void {
  const index = array.findIndex(matches)
  if (operation.op === 'add') {
    if (index !== -1) {
      throw new Error(`Atom add path already exists: ${operation.path}`)
    }
    array.push(cloneJsonValue(operation.value))
    return
  }
  if (index === -1) {
    throw new Error(`Atom path did not match an array member: ${operation.path}`)
  }
  if (operation.op === 'remove') {
    array.splice(index, 1)
  } else {
    array[index] = cloneJsonValue(operation.value)
  }
}

function resolveSegment(parent: unknown, segment: AtomPathSegment, path: string): unknown {
  switch (segment.type) {
    case 'root': {
      return parent
    }
    case 'property': {
      const record = requireRecord(parent, path)
      if (!(segment.name in record)) {
        throw new Error(`Atom property did not exist at ${path}: ${segment.name}`)
      }
      return record[segment.name]
    }
    case 'index': {
      const array = requireArray(parent, path)
      requireArrayIndex(array, segment.index, path)
      return array[segment.index]
    }
    case 'keyFilter': {
      const value = requireArray(parent, path).find((item) => filterPropertyMatches(item, segment))
      if (value === undefined) {
        throw new Error(`Atom key filter did not match at ${path}.`)
      }
      return value
    }
    case 'valueFilter': {
      const value = requireArray(parent, path).find((item) =>
        isDeepStrictEqual(item, segment.value),
      )
      if (value === undefined) {
        throw new Error(`Atom value filter did not match at ${path}.`)
      }
      return value
    }
    default: {
      throw new Error(`Unsupported Atom path segment: ${path}`)
    }
  }
}

function filterPropertyMatches(
  value: unknown,
  segment: Extract<AtomPathSegment, { type: 'keyFilter' }>,
): boolean {
  if (!isRecord(value)) {
    return false
  }
  let actual: unknown = value[segment.property]
  if (segment.literalKey !== true && segment.property.includes('.')) {
    actual = value
    for (const property of segment.property.split('.')) {
      actual = isRecord(actual) ? actual[property] : undefined
    }
  }
  return isDeepStrictEqual(actual, segment.value)
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObjectKeys(child)]),
    )
  }
  return value
}

function cloneJsonValue(value: unknown): unknown {
  return value === undefined ? undefined : structuredClone(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Atom path expected an object: ${path}`)
  }
  return value
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Atom path expected an array: ${path}`)
  }
  return value
}

function requireArrayIndex(array: readonly unknown[], index: number, path: string): void {
  if (!(index in array)) {
    throw new Error(`Atom array index ${index} did not exist: ${path}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
