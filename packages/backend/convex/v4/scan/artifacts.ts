import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../../_generated/server'
import { load, loadMany, namesAtOrAfter } from '../../objects'
import { artifactName, parseScanArtifact } from '../../scan/artifact'
import type { ScanArtifact } from '../../scan/artifact'
import { assertScanAt, assertScanPair, scanTimeInput } from './time'
import type { ScanPairTimes } from './time'

type ArtifactPair = { previous: ScanArtifact; next: ScanArtifact }

/** Reload both exact identities of a previously selected pair, independently of later captures. */
export async function loadPair(ctx: ActionCtx, pair: ScanPairTimes): Promise<ArtifactPair> {
  assertScanPair(pair.from_scan_at, pair.scan_at)
  const [previous, next] = await loadMany(ctx, [
    { path: 'scans', name: artifactName(pair.from_scan_at) },
    { path: 'scans', name: artifactName(pair.scan_at) },
  ])
  return {
    previous: parseArtifact(pair.from_scan_at, previous ?? null),
    next: parseArtifact(pair.scan_at, next ?? null),
  }
}

/** Load one exact capture, also used by current stats. Missing or inconsistent artifacts fail. */
export async function loadArtifact(ctx: ActionCtx, scanAt: string): Promise<ScanArtifact> {
  const id = artifactName(assertScanAt(scanAt))
  return parseArtifact(scanAt, await load(ctx, { path: 'scans', name: id }))
}

function parseArtifact(scanAt: string, text: string | null): ScanArtifact {
  const id = artifactName(scanAt)
  if (text === null) {
    throw new ConvexError(`Scan artifact not found: ${id}`)
  }
  const artifact = parseScanArtifact(id, text)
  if (artifact.scan_at !== scanAt || artifact.entries.some((entry) => entry.scan_at !== scanAt)) {
    throw new ConvexError(`Scan artifact identity does not match ${id}`)
  }
  return artifact
}

/** Select the first capture at/after `from` and its successor without loading their contents. */
export async function findPair(ctx: ActionCtx, from: string | null): Promise<ScanPairTimes | null> {
  const [previous, next] = await namesAtOrAfter(ctx, {
    path: 'scans',
    atOrAfter: from === null ? '' : artifactName(scanTimeInput.parse(from)),
    limit: 2,
  })
  if (previous === undefined || next === undefined) {
    return null
  }
  const fromScanAt = captureTime(previous)
  const scanAt = captureTime(next)
  assertScanPair(fromScanAt, scanAt)
  return { from_scan_at: fromScanAt, scan_at: scanAt }
}

function captureTime(name: string): string {
  const time = /^scan\.(?<time>.+)\.jsonl$/.exec(name)?.groups?.time
  if (time === undefined) {
    throw new ConvexError({ message: 'Invalid scan artifact name', name })
  }
  return assertScanAt(time)
}
