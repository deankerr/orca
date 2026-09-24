import { ConvexError } from 'convex/values'

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

/** Object name of the artifact captured at `scanAt`. */
export function artifactName(scanAt: string): string {
  return `scan.${assertScanAt(scanAt)}.jsonl`
}

/** Require a forward pair of canonical scan times. */
export function assertScanPair(fromScanAt: string, scanAt: string): void {
  assertScanAt(fromScanAt)
  assertScanAt(scanAt)

  if (scanAt <= fromScanAt) {
    throw new ConvexError('Scan pair must move forward in canonical time')
  }
}
