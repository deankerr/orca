import { z } from 'zod'

export type StatsSample = Record<string, number>
export type EndpointStats = Record<string, StatsSample>

export const statsSample = z.record(z.string(), z.number())
export const endpointStats = z.record(z.string(), statsSample)

// source stats object: endpoint_id plus a bag of finite numeric fields
export const statsSampleSource = z
  .looseObject({
    endpoint_id: z.string(),
  })
  .transform((raw) => {
    const { endpoint_id, ...rest } = raw
    const sample: StatsSample = {}
    for (const [key, value] of Object.entries(rest)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        sample[key] = value
      }
    }
    return { endpoint_id, sample: sortedRecord(sample) ?? {} }
  })

export const statsByTierSource = z.record(z.string(), statsSampleSource.optional())

// statsByTier is the source of truth. legacy payloads only had `stats`; those land under `default`.
export function collectEndpointStats(
  endpointId: string,
  stats: z.output<typeof statsSampleSource> | undefined,
  statsByTier: z.output<typeof statsByTierSource> | undefined,
): EndpointStats | null {
  const byTier: EndpointStats = {}

  if (statsByTier !== undefined) {
    for (const [tier, value] of Object.entries(statsByTier)) {
      if (value === undefined || value.endpoint_id !== endpointId) {
        continue
      }
      if (Object.keys(value.sample).length === 0) {
        continue
      }
      byTier[tier] = value.sample
    }
  }

  if (
    Object.keys(byTier).length === 0 &&
    stats !== undefined &&
    stats.endpoint_id === endpointId &&
    Object.keys(stats.sample).length > 0
  ) {
    byTier.default = stats.sample
  }

  return sortedRecord(byTier)
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
