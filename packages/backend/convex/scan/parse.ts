import { ConvexError } from 'convex/values'
import { z } from 'zod'

import { ScanEntry } from './collected'
import type { RawScan } from './collected'
import { scanTime } from './time'

/** Decode stored JSONL with the same identity checks for ingestion and standalone analysis. */
export function parseScan(scanAt: string, text: string | null): RawScan {
  scanTime.parse(scanAt)

  if (text === null) {
    throw new ConvexError(`Scan not found: ${scanAt}`)
  }

  const entries = ScanEntry.extend({ scan_at: z.string() })
    .array()
    .nonempty()
    .parse(
      text
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line): unknown => JSON.parse(line)),
    )

  if (entries.some((entry) => entry.scan_at !== scanAt)) {
    throw new ConvexError(`Scan identity does not match ${scanAt}`)
  }

  return {
    scan_at: scanAt,
    entries: entries.map(({ scan_at: _scanAt, ...entry }) => entry),
  }
}
