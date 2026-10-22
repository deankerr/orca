import { ConvexError } from 'convex/values'

import type { ActionCtx } from '#generated/server'
import * as objects from '#objects'

import { IsoDateTime } from '../isodatetime'
import type { RawScan, ScanEntry } from './collected'
import { extractScan } from './extraction/extract'

/** Up to `limit` capture times in `[atOrAfter, before)`, nearest the requested end first. */
export async function times(
  ctx: ActionCtx,
  {
    atOrAfter = null,
    before = null,
    limit,
    order,
  }: { atOrAfter?: string | null; before?: string | null; limit: number; order: 'asc' | 'desc' },
): Promise<string[]> {
  return await discover(ctx, {
    atOrAfter: atOrAfter === null ? null : IsoDateTime.parse(atOrAfter),
    before: before === null ? null : IsoDateTime.parse(before),
    limit,
    order,
  })
}

export async function latest(
  ctx: ActionCtx,
  { atOrAfter = null }: { atOrAfter?: string | null } = {},
): Promise<string | null> {
  const [scanAt] = await times(ctx, { atOrAfter, limit: 1, order: 'desc' })
  return scanAt ?? null
}

async function discover(
  ctx: ActionCtx,
  selection: {
    atOrAfter: string | null
    before: string | null
    limit: number
    order: 'asc' | 'desc'
  },
) {
  const { atOrAfter, before, limit, order } = selection
  const names = await objects.namesAtOrAfter(ctx, {
    path: 'scans',
    atOrAfter: atOrAfter === null ? '' : identity(atOrAfter).name,
    ...(before === null ? {} : { before: identity(before).name }),
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
  const time = /^scan\.(?<time>.+)\.jsonl$/u.exec(name)?.groups?.time

  if (time === undefined) {
    throw new ConvexError({ message: 'Invalid scan object name', name })
  }

  return IsoDateTime.parse(time)
}
