import { parseAsArrayOf, parseAsString, parseAsStringEnum } from 'nuqs/server'
import type { inferParserType } from 'nuqs/server'

const parseAsAttributeArray = parseAsArrayOf(parseAsString).withDefault([])

// oxlint-disable sort-keys -- Key order is the order of query parameters in generated URLs (Object.keys below, nuqs serialization).
export const endpointGridParsers = {
  q: parseAsString,
  uuid: parseAsString,
  has: parseAsAttributeArray,
  not: parseAsAttributeArray,
  sort: parseAsString,
  order: parseAsStringEnum(['asc', 'desc'] as const),
}
// oxlint-enable sort-keys

export const endpointGridQueryKeys = Object.keys(endpointGridParsers)

export const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

export const endpointGridResetPatch = {
  has: [],
  not: [],
  order: null,
  q: null,
  sort: null,
  uuid: null,
} satisfies inferParserType<typeof endpointGridParsers>

export function normalizeEndpointGridQuery(value: string) {
  return value.trim()
}

export function hasEndpointGridQuery(value: string) {
  return normalizeEndpointGridQuery(value).length > 0
}
