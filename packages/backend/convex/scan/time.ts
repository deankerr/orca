import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

/**
 * Canonical capture time produced by `Date.toISOString()`.
 * The fixed shape sorts lexicographically in chronological order.
 */
export const scanTime = z.iso.datetime({ precision: 3 })

/** Times identifying the previous and next scans, whether or not the pair has been ingested. */
export const scanTimes = v.object({ from_scan_at: v.string(), scan_at: v.string() })
export type ScanTimes = Infer<typeof scanTimes>
