import { ConvexError } from 'convex/values'

import { IsoDateTime } from '../isodatetime'
import type { ObjectReader } from '../objects'
import type { RawScan, ScanEntry } from './collected'
import { extract } from './extract'
import type { ScanPair } from './schema'

/** Parse an external scan reference; storage names and ISO datetimes identify the same capture. */
export function scanAtFromReference(reference: string): string {
  return IsoDateTime.parse(reference.startsWith('scan.') ? timeFromName(reference) : reference)
}

/** Scan's storage format is JSONL with the capture time repeated on every collected entry. */
export function encodeScan(scan: RawScan) {
  return {
    ...identity(scan.scan_at),
    text: `${scan.entries.map((entry) => JSON.stringify({ ...entry, scan_at: scan.scan_at })).join('\n')}\n`,
  }
}

/** Bind scan selection and decoding to Objects, independently of its storage or transport. */
export function createScanReader(objects: ObjectReader) {
  async function times(from: string | null, limit: number, order: 'asc' | 'desc') {
    const names = await objects.namesAtOrAfter({
      path: 'scans',
      atOrAfter: from === null ? '' : identity(from).name,
      limit,
      order,
    })

    return names.map((name) => IsoDateTime.parse(timeFromName(name)))
  }

  /** Newest capture at/after a known time; retain that time if no newer object exists. */
  async function latest(from: string | null = null): Promise<string | null> {
    const [scanAt] = await times(from, 1, 'desc')
    return scanAt ?? from
  }

  /** Load collected data by capture time or object name; omission selects the newest scan. */
  async function loadRaw(reference?: string): Promise<RawScan> {
    const scanAt =
      reference === undefined
        ? await latest()
        : reference.startsWith('scan.')
          ? scanAtFromReference(reference)
          : reference

    if (scanAt === null) {
      throw new ConvexError('No stored scans')
    }

    const [text] = await objects.loadMany([identity(scanAt)])
    return decodeScan(scanAt, text ?? null)
  }

  /** Exact pair in one batch, including retries of historical work. */
  async function loadPair({
    from_scan_at: from,
    scan_at: to,
  }: {
    from_scan_at: string
    scan_at: string
  }): Promise<ScanPair> {
    if (to <= from) {
      throw new ConvexError('Scan pair must move forward in canonical time')
    }

    const [previous, next] = await objects.loadMany([identity(from), identity(to)])
    return {
      previous: extract(decodeScan(from, previous ?? null)),
      next: extract(decodeScan(to, next ?? null)),
    }
  }

  /** First capture at/after `from` and its successor; null means no complete pair yet. */
  async function loadNextPair(from: string | null = null): Promise<ScanPair | null> {
    const [previous, next] = await times(from, 2, 'asc')

    if (previous === undefined || next === undefined) {
      return null
    }

    return await loadPair({ from_scan_at: previous, scan_at: next })
  }

  return { latest, loadRaw, loadPair, loadNextPair }
}

function identity(scanAt: string) {
  return { path: 'scans', name: `scan.${scanAt}.jsonl` }
}

function timeFromName(name: string): string {
  const time = /^scan\.(?<time>.+)\.jsonl$/.exec(name)?.groups?.time

  if (time === undefined) {
    throw new ConvexError({ message: 'Invalid scan object name', name })
  }

  return time
}

/** Decode our persisted record format; collection already parsed the upstream fields. */
function decodeScan(scanAt: string, text: string | null): RawScan {
  if (text === null) {
    throw new ConvexError(`Scan not found: ${scanAt}`)
  }

  const entries = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- JSONL is our own typed storage format, written by encodeScan.
      const { scan_at: _scanAt, ...entry } = JSON.parse(line) as ScanEntry & { scan_at: string }
      return entry
    })

  return { scan_at: scanAt, entries }
}
