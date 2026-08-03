export type JsonRecord = Record<string, unknown>

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalize)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    )
  }
  return value
}

export const canonicalJson = (value: unknown): string => JSON.stringify(normalize(value))
