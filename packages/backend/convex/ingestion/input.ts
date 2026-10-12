import type { Scan } from '#scans/extraction'

export type ScanPair = {
  previous: Omit<Scan, 'scan_at'> & { scan_at: string | null }
  next: Scan
}
