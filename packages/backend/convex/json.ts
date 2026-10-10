import { isPlainObject } from 'remeda'
import { z } from 'zod'

export const JsonObject = z.record(z.string(), z.json())
export const JsonObjectFromString = z
  .string()
  .transform((json) => JsonObject.parse(JSON.parse(json)))

export type JsonValue = z.infer<ReturnType<typeof z.json>>

/** Recursively sort object keys while preserving array order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    isPlainObject(nested)
      ? Object.fromEntries(
          Object.entries(nested).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : nested,
  )
}
