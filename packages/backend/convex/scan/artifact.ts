import { ConvexError } from 'convex/values'
import { z } from 'zod'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { load, store } from '../objects'
import { ScanArtifactEntry } from './schema'

const SCAN_ARTIFACT_OBJECT_PATH = 'scans'

/** A parsed scan artifact and its object-store identity. */
export type ScanArtifact = {
  id: string
  scan_at: string
  entries: ScanArtifactEntry[]
}

/** Parse scan entries and assign one authoritative timestamp to the artifact. */
export function createScanArtifact(
  entries: (Record<string, unknown> & { scan_at?: never })[],
  scan_at: string = new Date().toISOString(),
): ScanArtifact {
  return {
    id: artifactName(scan_at),
    scan_at,
    entries: entries.map((entry) => ScanArtifactEntry.parse({ ...entry, scan_at })),
  }
}

/** Store a scan artifact in the named object store. */
export async function storeScanArtifact(ctx: ActionCtx, artifact: ScanArtifact): Promise<void> {
  await store(ctx, {
    path: SCAN_ARTIFACT_OBJECT_PATH,
    name: artifact.id,
    text: `${artifact.entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
  })
}

/** Load and parse a required scan artifact. */
export async function loadScanArtifact(ctx: ActionCtx, id: string): Promise<ScanArtifact> {
  const artifact = await findScanArtifact(ctx, id)
  if (artifact === null) {
    throw new ConvexError(`Scan artifact not found: ${id}`)
  }
  return artifact
}

/** Load and parse a scan artifact when it exists. */
export async function findScanArtifact(ctx: ActionCtx, id: string): Promise<ScanArtifact | null> {
  const text = await load(ctx, { path: SCAN_ARTIFACT_OBJECT_PATH, name: id })
  return text === null ? null : parseScanArtifact(id, text)
}

function parseScanArtifact(id: string, text: string): ScanArtifact {
  const entries = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => ScanArtifactEntry.parse(JSON.parse(line)))

  return {
    id,
    scan_at: z.string().parse(entries[0]?.scan_at),
    entries,
  }
}

/** Return the first scan artifact ID ordered after `afterId`. */
export async function nextScanArtifactId(
  ctx: Pick<ActionCtx, 'runQuery'>,
  afterId: string,
): Promise<string | null> {
  return await ctx.runQuery(internal.objects.locators.nextName, {
    path: SCAN_ARTIFACT_OBJECT_PATH,
    afterName: afterId,
  })
}

/** Object name of the artifact captured at a scan time. */
export function artifactName(scanAt: string): string {
  return `scan.${scanAt}.jsonl`
}

/** Discover the next capture time without loading artifact contents. */
export async function nextScanAt(
  ctx: Pick<ActionCtx, 'runQuery'>,
  after: string | null,
): Promise<string | null> {
  const id = await nextScanArtifactId(ctx, after === null ? '' : artifactName(after))
  if (id === null) {
    return null
  }

  const scanAt = /^scan\.(?<scanAt>.+)\.jsonl$/.exec(id)?.groups?.scanAt
  if (scanAt === undefined) {
    throw new ConvexError({ message: 'Invalid scan artifact name', id })
  }
  return scanAt
}
