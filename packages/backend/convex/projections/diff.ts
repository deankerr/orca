import { diff } from 'json-diff-ts'

import type { ScanProjection } from './fromScan'

/** One hierarchical change document together with the complete projected owners. */
export function compareScanProjections(previous: ScanProjection, next: ScanProjection) {
  return {
    previous,
    next,
    document: {
      version: 2,
      from: { artifactId: previous.id, scan_at: previous.scan_at },
      to: { artifactId: next.id, scan_at: next.scan_at },
      changes: diff(previous.catalog, next.catalog, { treatTypeChangeAsReplace: false }),
    },
  }
}

export type ScanComparison = ReturnType<typeof compareScanProjections>
