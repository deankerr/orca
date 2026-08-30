import * as R from 'remeda'
import { z } from 'zod'

export const mepsMetadata = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string(), z.array(z.string())]),
)

export type MepsMetadata = z.output<typeof mepsMetadata>

function isMetadataValue(value: unknown): value is MepsMetadata[string] {
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return true
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

// nested objects become dot-delimited keys; values the schema cannot hold are dropped
export function flattenMetadata(source: Record<string, unknown>): MepsMetadata {
  const metadata: MepsMetadata = {}

  const walk = (key: string, value: unknown) => {
    if (R.isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        walk(`${key}.${nestedKey}`, nestedValue)
      }
      return
    }

    if (isMetadataValue(value)) {
      metadata[key] = value
    }
  }

  for (const [key, value] of Object.entries(source)) {
    walk(key, value)
  }

  return metadata
}
