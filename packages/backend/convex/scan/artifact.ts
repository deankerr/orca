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
    id: `scan.${scan_at}.jsonl`,
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
  const text = z.string().parse(await load(ctx, { path: SCAN_ARTIFACT_OBJECT_PATH, name: id }))
  return parseScanArtifact(id, text)
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
export async function nextScanArtifactId(ctx: ActionCtx, afterId: string): Promise<string | null> {
  return await ctx.runQuery(internal.objects.locators.nextName, {
    path: SCAN_ARTIFACT_OBJECT_PATH,
    afterName: afterId,
  })
}
