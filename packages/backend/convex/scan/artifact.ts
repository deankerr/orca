import { z } from 'zod'

import type { ActionCtx } from '../_generated/server'
import { store } from '../objects'
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

/** Shared artifact parsing, independent of local/remote object retrieval. */
export function parseScanArtifact(id: string, text: string): ScanArtifact {
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

/** Object name of the artifact captured at a scan time. */
export function artifactName(scanAt: string): string {
  return `scan.${scanAt}.jsonl`
}
