import { ConvexError } from 'convex/values'

import type { ActionCtx } from '#generated/server'
import * as objects from '#objects'

import { IsoDateTime } from '../isodatetime'
import type { RawScan, ScanEntry } from './collected'
import { extractScan } from './extraction/extract'

/** First stored capture at or after the inclusive starting time. */
export async function firstAtOrAfter(
  ctx: ActionCtx,
  time: string | null = null,
): Promise<string | null> {
  const times = await discover(ctx, time, 1, 'asc')
  return times[0] ?? null
}

/** Successor of a time, whether or not that time still has a stored capture. */
export async function nextAfter(ctx: ActionCtx, time: string): Promise<string | null> {
  const after = IsoDateTime.parse(time)
  const times = await discover(ctx, after, 2, 'asc')
  return times.find((scanAt) => scanAt > after) ?? null
}

export async function latest(
  ctx: ActionCtx,
  { atOrAfter = null }: { atOrAfter?: string | null } = {},
): Promise<string | null> {
  const times = await discover(ctx, atOrAfter, 1, 'desc')
  return times[0] ?? null
}

async function discover(ctx: ActionCtx, time: string | null, limit: number, order: 'asc' | 'desc') {
  const names = await objects.namesAtOrAfter(ctx, {
    path: 'scans',
    atOrAfter: time === null ? '' : identity(IsoDateTime.parse(time)).name,
    limit,
    order,
  })

  return names.map(timeFromName)
}

/** Load one selected capture into the shared ORCA scan shape. */
export async function load(ctx: ActionCtx, scanAt: string) {
  return extractScan(await loadCollected(ctx, scanAt))
}

/** Collected source for capture inspection and the frozen public API. */
export async function loadCollected(ctx: ActionCtx, reference: string): Promise<RawScan> {
  const scan_at = reference.startsWith('scan.')
    ? timeFromName(reference)
    : IsoDateTime.parse(reference)
  const [text] = await objects.loadMany(ctx, [identity(scan_at)])

  if (text === null || text === undefined) {
    throw new ConvexError({ message: 'Scan not found', scan_at })
  }

  const entries = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Collection already parsed this persisted JSONL format.
      const { scan_at: _scanAt, ...entry } = JSON.parse(line) as ScanEntry & { scan_at: string }
      return entry
    })

  return { scan_at, entries }
}

/** Objects owns compression, storage, and source selection. */
export async function store(ctx: ActionCtx, scan: RawScan): Promise<void> {
  if (scan.entries.length === 0) {
    throw new ConvexError('Cannot store an empty scan')
  }

  await objects.store(ctx, {
    ...identity(scan.scan_at),
    text: `${scan.entries.map((entry) => JSON.stringify({ ...entry, scan_at: scan.scan_at })).join('\n')}\n`,
  })
}

function identity(scanAt: string) {
  return { path: 'scans', name: `scan.${scanAt}.jsonl` }
}

function timeFromName(name: string): string {
  const time = /^scan\.(?<time>.+)\.jsonl$/.exec(name)?.groups?.time

  if (time === undefined) {
    throw new ConvexError({ message: 'Invalid scan object name', name })
  }

  return IsoDateTime.parse(time)
}
