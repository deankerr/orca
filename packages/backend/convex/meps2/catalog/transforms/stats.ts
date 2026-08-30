import * as R from 'remeda'
import { z } from 'zod'

export const statsSample = z.record(z.string(), z.number())
export const endpointStats = z.record(z.string(), statsSample)

export type StatsSample = z.output<typeof statsSample>
export type EndpointStats = z.output<typeof endpointStats>

// statsByTier is the source of truth. legacy payloads only had `stats`; those land under `default`.
export function collectEndpointStats(
  endpointId: string,
  stats: unknown,
  statsByTier: unknown,
): EndpointStats | null {
  const byTier: EndpointStats = {}

  if (R.isPlainObject(statsByTier)) {
    for (const [tier, value] of Object.entries(statsByTier)) {
      const sample = numericSample(endpointId, value)
      if (sample !== null) {
        byTier[tier] = sample
      }
    }
  }

  if (Object.keys(byTier).length === 0) {
    const sample = numericSample(endpointId, stats)
    if (sample !== null) {
      byTier.default = sample
    }
  }

  return sortedRecord(byTier)
}

function numericSample(endpointId: string, value: unknown): StatsSample | null {
  if (!R.isPlainObject(value) || value.endpoint_id !== endpointId) {
    return null
  }

  const sample: StatsSample = {}
  for (const [key, field] of Object.entries(value)) {
    if (key === 'endpoint_id') {
      continue
    }
    if (typeof field === 'number' && Number.isFinite(field)) {
      sample[key] = field
    }
  }

  return sortedRecord(sample)
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> | null {
  const keys = Object.keys(record).toSorted()
  if (keys.length === 0) {
    return null
  }

  const sorted: Record<string, T> = {}
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined) {
      sorted[key] = value
    }
  }
  return sorted
}
