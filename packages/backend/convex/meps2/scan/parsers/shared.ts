import type { Infer } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import type { modelsTable } from '../../tables/models'

// metadata record shape shared by all meps2 tables
export type MepsMetadata = Infer<typeof modelsTable.validator>['metadata']

// values the metadata validator can hold: scalars and string arrays
function isMetadataValue(value: unknown): value is MepsMetadata[string] {
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return true
  }
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

// flattens raw record fields into a metadata record:
// nested objects become dot-delimited keys, values the schema cannot hold (nulls, mixed arrays) are dropped
export function flattenMetadata(source: Record<string, unknown>): MepsMetadata {
  const metadata: MepsMetadata = {}

  const walk = (key: string, value: unknown) => {
    // recurse into nested objects, joining key segments with dots
    if (R.isPlainObject(value)) {
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        walk(`${key}.${nestedKey}`, nestedValue)
      }
      return
    }

    // keep only conforming values
    if (isMetadataValue(value)) {
      metadata[key] = value
    }
  }

  for (const [key, value] of Object.entries(source)) {
    walk(key, value)
  }

  return metadata
}

export const zNullableString = z
  .string()
  .nullable()
  .transform((val) => (val === '' ? null : val))
