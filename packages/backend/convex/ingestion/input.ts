import { v } from 'convex/values'

import type { Scan } from '#scans/extraction'

export const ingestArgs = v.object({
  from_scan_at: v.union(v.string(), v.null()),
  scan_at: v.string(),
  has_later_scan: v.boolean(),
})

export type ScanPair = {
  previous: Omit<Scan, 'scan_at'> & { scan_at: string | null }
  next: Scan
  has_later_scan: boolean
}
