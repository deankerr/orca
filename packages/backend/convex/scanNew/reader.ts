import { ConvexError } from 'convex/values'

import type { ObjectReader } from '#objects'
import type { RawScan, ScanEntry } from '#scan/collection'

import { IsoDateTime } from '../isodatetime'
import { fromCollected } from './extract'
import type { Scan, ScanPair } from './model'

/** Read the existing JSONL captures directly, without legacy Scan's entity filtering. */
export function createScanReader(objects: ObjectReader) {
  async function nextInput(after: string | null) {
    const names = await objects.namesAtOrAfter({
      path: 'scans',
      atOrAfter: after === null ? '' : `scan.${after}.jsonl`,
      limit: after === null ? 1 : 2,
      order: 'asc',
    })
    const [first, next] = names.map(scanAtFromName)

    if (after === null) {
      return first === undefined ? null : { from_scan_at: null, scan_at: first }
    }

    if (first !== after) {
      throw new ConvexError({ message: 'Previous scan is no longer available', scan_at: after })
    }

    if (next === undefined) {
      return null
    }

    if (next <= after) {
      throw new ConvexError({
        message: 'Scan pair must move forward in canonical time',
        from_scan_at: after,
        scan_at: next,
      })
    }

    return { from_scan_at: after, scan_at: next }
  }

  async function loadPair({
    from_scan_at,
    scan_at,
  }: {
    from_scan_at: string | null
    scan_at: string
  }): Promise<ScanPair> {
    const times = from_scan_at === null ? [scan_at] : [from_scan_at, scan_at]
    const texts = await objects.loadMany(
      times.map((time) => ({ path: 'scans', name: `scan.${time}.jsonl` })),
    )
    const empty: Scan = {
      scan_at: '',
      models: new Map(),
      providers: new Map(),
      endpoints: new Map(),
      stats: [],
    }

    return {
      previous:
        from_scan_at === null ? empty : fromCollected(decodeScan(from_scan_at, texts[0] ?? null)),
      next: fromCollected(decodeScan(scan_at, texts.at(-1) ?? null)),
    }
  }

  return { nextInput, loadPair }
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
