import { ConvexError } from 'convex/values'

import type { ObjectReader } from '#objects'
import type { RawScan, ScanEntry } from '#scan/collection'

import { IsoDateTime } from '../isodatetime'
import { fromCollected } from './extract'
import type { ScanPair } from './model'

/** Read the existing JSONL captures directly, without legacy Scan's entity filtering. */
export function createScanReader(objects: ObjectReader) {
  async function loadNextPair(): Promise<ScanPair | null> {
    const names = await objects.namesAtOrAfter({
      path: 'scans',
      atOrAfter: '',
      limit: 2,
      order: 'asc',
    })
    const [previous, next] = names.map(scanAtFromName)

    if (previous === undefined || next === undefined) {
      return null
    }

    if (next <= previous) {
      throw new ConvexError({
        message: 'Scan pair must move forward in canonical time',
        from_scan_at: previous,
        scan_at: next,
      })
    }

    const [previousText, nextText] = await objects.loadMany([
      { path: 'scans', name: `scan.${previous}.jsonl` },
      { path: 'scans', name: `scan.${next}.jsonl` },
    ])

    return {
      previous: fromCollected(decodeScan(previous, previousText ?? null)),
      next: fromCollected(decodeScan(next, nextText ?? null)),
    }
  }

  return { loadNextPair }
}

function scanAtFromName(name: string): string {
  const time = /^scan\.(?<time>.+)\.jsonl$/.exec(name)?.groups?.time

  if (time === undefined) {
    throw new ConvexError({ message: 'Invalid scan object name', name })
  }

  return IsoDateTime.parse(time)
}

/** Collection parsed the upstream fields; this decodes the existing persisted JSONL format. */
function decodeScan(scan_at: string, text: string | null): RawScan {
  if (text === null) {
    throw new ConvexError({ message: 'Scan not found', scan_at })
  }

  const entries = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSONL is the existing typed capture format, written by Scan's encodeScan.
      const { scan_at: _scanAt, ...entry } = JSON.parse(line) as ScanEntry & { scan_at: string }
      return entry
    })

  return { scan_at, entries }
}
