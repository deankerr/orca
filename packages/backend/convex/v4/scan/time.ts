import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

/** Exact capture identities, recorded by ingestion and reused for retries. */
export const pairTimes = v.object({ from_scan_at: v.string(), scan_at: v.string() })
export type ScanPairTimes = Infer<typeof pairTimes>

/** Operator inputs accept ISO dates or timestamps with a timezone, normalized for indexed selection. */
export const scanTimeInput = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value).toISOString())

/**
 * Canonical capture time produced by `Date.toISOString()`.
 * The fixed shape sorts lexicographically in chronological order.
 */
const SCAN_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** Accept a real UTC instant in the canonical scan-time form. */
export function assertScanAt(value: string): string {
  const timestamp = Date.parse(value)

  if (
    !SCAN_AT.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new ConvexError(`Scan time is not canonical UTC: ${value}`)
  }

  return value
}

/** Require a forward pair of canonical scan times. */
export function assertScanPair(fromScanAt: string, scanAt: string): void {
  assertScanAt(fromScanAt)
  assertScanAt(scanAt)

  if (scanAt <= fromScanAt) {
    throw new ConvexError('Scan pair must move forward in canonical time')
  }
}
