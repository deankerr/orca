import { parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs/server'
import type { inferParserType } from 'nuqs/server'

const parseAsAttributeArray = parseAsArrayOf(parseAsString).withDefault([])

export const endpointGridParsers = {
  q: parseAsString,
  uuid: parseAsString,
  has: parseAsAttributeArray,
  not: parseAsAttributeArray,
  sort: parseAsString,
  order: parseAsStringEnum(['asc', 'desc'] as const),
}

export const endpointGridQueryKeys = Object.keys(endpointGridParsers)

export const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

export const endpointGridResetPatch = {
  q: null,
  uuid: null,
  has: [],
  not: [],
  sort: null,
  order: null,
} satisfies inferParserType<typeof endpointGridParsers>

export function normalizeEndpointGridQuery(value: string) {
  return value.trim()
}

export function hasEndpointGridQuery(value: string) {
  return normalizeEndpointGridQuery(value).length > 0
}
