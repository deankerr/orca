import { v } from 'convex/values'

import { internalMutation } from '../_generated/server'

type CountAndPct = {
  count: number
  pct: number
}

type FullPresenceReport = CountAndPct &
  Partial<{
    undefinedCount: number
    undefinedPct: number
  }>

type SparsePresenceReport = Partial<CountAndPct> &
  Partial<{
    undefinedCount: number
    undefinedPct: number
  }>

type BooleanFieldReport = SparsePresenceReport & {
  true: CountAndPct
  false: CountAndPct
}

type ArrayFieldReport = SparsePresenceReport & {
  totalValues: number
  values: Record<string, CountAndPct>
}

type ObjectFieldReport = SparsePresenceReport & {
  fields: Record<string, FieldReport>
}

type FieldReport = FullPresenceReport | BooleanFieldReport | ArrayFieldReport | ObjectFieldReport

type FieldUsageReport = {
  total: number
  fields: Record<string, FieldReport>
}

type StringFieldState = {
  kind: 'string'
  definedCount: number
}

type NumberFieldState = {
  kind: 'number'
  definedCount: number
}

type BooleanFieldState = {
  kind: 'boolean'
  trueCount: number
  falseCount: number
}

type ArrayFieldState = {
  kind: 'array'
  definedCount: number
  totalValues: number
  values: Record<string, number>
}

type ObjectFieldState = {
  kind: 'object'
  definedCount: number
  fields: Record<string, FieldState>
}

type FieldState =
  | StringFieldState
  | NumberFieldState
  | BooleanFieldState
  | ArrayFieldState
  | ObjectFieldState

type DocumentShape = Record<string, unknown>

const pct = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 100 * 100) / 100

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getFieldKind = (value: unknown): FieldState['kind'] => {
  if (typeof value === 'string') {
    return 'string'
  }
  if (typeof value === 'number') {
    return 'number'
  }
  if (typeof value === 'boolean') {
    return 'boolean'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  if (isPlainObject(value)) {
    return 'object'
  }

  throw new Error(`Unsupported field type: ${typeof value}`)
}

const createFieldState = (value: unknown): FieldState => {
  const kind = getFieldKind(value)

  if (kind === 'string') {
    return { kind, definedCount: 0 }
  }
  if (kind === 'number') {
    return { kind, definedCount: 0 }
  }
  if (kind === 'boolean') {
    return { kind, trueCount: 0, falseCount: 0 }
  }
  if (kind === 'array') {
    return { kind, definedCount: 0, totalValues: 0, values: {} }
  }

  return { kind, definedCount: 0, fields: {} }
}

const getArrayBucket = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }
  if (value === null) {
    return 'type:null'
  }
  if (Array.isArray(value)) {
    return 'type:array'
  }

  return `type:${typeof value}`
}

const addValueToState = (state: FieldState, value: unknown) => {
  if (state.kind === 'string' && typeof value === 'string') {
    state.definedCount += 1
    return
  }

  if (state.kind === 'number' && typeof value === 'number') {
    state.definedCount += 1
    return
  }

  if (state.kind === 'boolean' && typeof value === 'boolean') {
    if (value) {
      state.trueCount += 1
    } else {
      state.falseCount += 1
    }
    return
  }

  if (state.kind === 'array' && Array.isArray(value)) {
    state.definedCount += 1
    for (const item of value) {
      const bucket = getArrayBucket(item)
      state.values[bucket] = (state.values[bucket] ?? 0) + 1
      state.totalValues += 1
    }
    return
  }

  if (state.kind === 'object' && isPlainObject(value)) {
    state.definedCount += 1
    walkObject(state.fields, value)
    return
  }

  throw new Error(`Unexpected value for ${state.kind} field`)
}

const getOrCreateFieldState = (fields: Record<string, FieldState>, key: string, value: unknown) => {
  const nextKind = getFieldKind(value)
  const state = fields[key] ?? createFieldState(value)

  if (state.kind !== nextKind) {
    throw new Error(`Mixed field types are not supported for "${key}"`)
  }

  fields[key] = state
  return state
}

const walkObject = (fields: Record<string, FieldState>, value: DocumentShape) => {
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue === undefined) {
      continue
    }

    const state = getOrCreateFieldState(fields, key, fieldValue)
    addValueToState(state, fieldValue)
  }
}

const finalizePresence = (definedCount: number, total: number): FullPresenceReport => {
  const undefinedCount = total - definedCount

  return {
    count: definedCount,
    pct: pct(definedCount, total),
    ...(undefinedCount > 0
      ? {
          undefinedCount,
          undefinedPct: pct(undefinedCount, total),
        }
      : {}),
  }
}

const finalizeSparsePresence = (definedCount: number, total: number): SparsePresenceReport => {
  if (definedCount === total) {
    return {}
  }

  return finalizePresence(definedCount, total)
}

const finalizeFieldState = (state: FieldState, total: number): FieldReport => {
  if (state.kind === 'string') {
    return {
      ...finalizePresence(state.definedCount, total),
    }
  }

  if (state.kind === 'number') {
    return {
      ...finalizePresence(state.definedCount, total),
    }
  }

  if (state.kind === 'boolean') {
    const definedCount = state.trueCount + state.falseCount

    return {
      ...finalizeSparsePresence(definedCount, total),
      true: {
        count: state.trueCount,
        pct: pct(state.trueCount, total),
      },
      false: {
        count: state.falseCount,
        pct: pct(state.falseCount, total),
      },
    }
  }

  if (state.kind === 'array') {
    return {
      ...finalizeSparsePresence(state.definedCount, total),
      totalValues: state.totalValues,
      values: Object.fromEntries(
        Object.entries(state.values)
          .toSorted((a, b) => b[1] - a[1])
          .map(([key, count]) => [
            key,
            {
              count,
              pct: pct(count, state.totalValues),
            },
          ]),
      ),
    }
  }

  return {
    ...finalizeSparsePresence(state.definedCount, total),
    fields: Object.fromEntries(
      Object.entries(state.fields).map(([key, childState]) => [
        key,
        finalizeFieldState(childState, total),
      ]),
    ),
  }
}

const createFieldReport = <T extends DocumentShape>(docs: T[]): FieldUsageReport => {
  const fields: Record<string, FieldState> = {}

  for (const doc of docs) {
    walkObject(fields, doc)
  }

  return {
    total: docs.length,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, state]) => [key, finalizeFieldState(state, docs.length)]),
    ),
  }
}

export const model = internalMutation({
  args: { excludeUnavailable: v.boolean() },
  handler: async (ctx, { excludeUnavailable }) => {
    const allModels = await ctx.db.query('or_views_models').collect()
    const models = excludeUnavailable
      ? allModels.filter((modelDoc) => modelDoc.unavailable_at === undefined)
      : allModels

    return createFieldReport(models)
  },
})

export const provider = internalMutation({
  args: { excludeUnavailable: v.boolean() },
  handler: async (ctx, { excludeUnavailable }) => {
    const allProviders = await ctx.db.query('or_views_providers').collect()
    const providers = excludeUnavailable
      ? allProviders.filter((providerDoc) => providerDoc.unavailable_at === undefined)
      : allProviders

    return createFieldReport(providers)
  },
})

export const endpoint = internalMutation({
  args: { excludeUnavailable: v.boolean() },
  handler: async (ctx, { excludeUnavailable }) => {
    const allEndpoints = await ctx.db.query('or_views_endpoints').collect()
    const endpoints = excludeUnavailable
      ? allEndpoints.filter((endpointDoc) => endpointDoc.unavailable_at === undefined)
      : allEndpoints

    return createFieldReport(endpoints)
  },
})
