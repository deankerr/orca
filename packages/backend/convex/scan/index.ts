import { ConvexError } from 'convex/values'
import { z } from 'zod'

import type { ActionCtx } from '../_generated/server'
import * as objects from '../objects'
import { ScanEntry } from './collected'
import type { RawScan } from './collected'
import { extract } from './extract'
import type { ScanPair } from './schema'
import { scanTime } from './time'
import type { ScanTimes } from './time'

export type { Scan, ScanPair, ScannedModel, ScannedEndpoint, ScannedProvider } from './schema'
export type { ScanTimes } from './time'

/** Validate and store a complete scan. Objects owns compression and source selection. */
export async function store(ctx: ActionCtx, scan: RawScan): Promise<void> {
  const scanAt = scan.scan_at
  const entries = ScanEntry.array().nonempty().parse(scan.entries)

  await objects.store(ctx, {
    ...identity(scanAt),
    text: `${entries.map((entry) => JSON.stringify({ ...entry, scan_at: scanAt })).join('\n')}\n`,
  })
}

/** Full collected entries for the frozen public API; ordinary consumers load extracted scan pairs. */
export async function loadRaw(ctx: ActionCtx, scanAt: string): Promise<RawScan> {
  return parse(scanAt, await objects.load(ctx, identity(scanAt)))
}

/** Load an exact pair in one object read, including when retrying historical work. */
export async function loadPair(
  ctx: ActionCtx,
  { from_scan_at: fromScanAt, scan_at: scanAt }: ScanTimes,
): Promise<ScanPair> {
  if (scanAt <= fromScanAt) {
    throw new ConvexError('Scan pair must move forward in canonical time')
  }

  const [previous, next] = await objects.loadMany(ctx, [identity(fromScanAt), identity(scanAt)])

  return {
    previous: extract(parse(fromScanAt, previous ?? null)),
    next: extract(parse(scanAt, next ?? null)),
  }
}

/** First scan at/after `from` and its successor; null means no complete pair yet. */
export async function loadNextPair(
  ctx: ActionCtx,
  from: string | null = null,
): Promise<ScanPair | null> {
  const times = await findPair(ctx, from)
  return times === null ? null : await loadPair(ctx, times)
}

/** Discover the latest scan, optionally starting from an already-known scan time. */
export async function latest(ctx: ActionCtx, from: string | null = null): Promise<string | null> {
  let latestAt = from

  // Discovery is ascending and inclusive; pages overlap by one to avoid skipping scans.
  while (true) {
    const times = await timesAtOrAfter(ctx, latestAt, 100)
    latestAt = times.at(-1) ?? latestAt

    if (times.length < 100) {
      return latestAt
    }
  }
}

/** First scan at/after `from` and its successor, without loading their contents. */
async function findPair(ctx: ActionCtx, from: string | null): Promise<ScanTimes | null> {
  const [previous, next] = await timesAtOrAfter(ctx, from, 2)

  if (previous === undefined || next === undefined) {
    return null
  }

  return { from_scan_at: previous, scan_at: next }
}

function identity(scanAt: string) {
  return { path: 'scans', name: `scan.${scanAt}.jsonl` }
}

async function timesAtOrAfter(ctx: ActionCtx, from: string | null, limit: number) {
  const names = await objects.namesAtOrAfter(ctx, {
    path: 'scans',
    atOrAfter: from === null ? '' : identity(from).name,
    limit,
  })

  return names.map((name) => {
    const time = /^scan\.(?<time>.+)\.jsonl$/.exec(name)?.groups?.time

    if (time === undefined) {
      throw new ConvexError({ message: 'Invalid scan object name', name })
    }

    return scanTime.parse(time)
  })
}

function parse(scanAt: string, text: string | null): RawScan {
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
