import { z } from 'zod'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { load, store } from '../objects'
import { ScanArtifactEntry } from './schema'

const SCAN_ARTIFACT_OBJECT_PATH = 'scans'

export type ScanArtifact = {
  id: string
  scan_at: string
  entries: ScanArtifactEntry[]
}

export function createScanArtifact(
  entries: object[],
  scan_at: string = new Date().toISOString(),
): ScanArtifact {
  return {
    id: `scan.${scan_at}.jsonl`,
    scan_at,
    entries: entries.map((entry) => ScanArtifactEntry.parse({ scan_at, ...entry })),
  }
}

export async function storeScanArtifact(ctx: ActionCtx, artifact: ScanArtifact): Promise<void> {
  await store(ctx, {
    path: SCAN_ARTIFACT_OBJECT_PATH,
    name: artifact.id,
    text: `${artifact.entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`,
  })
}

export async function loadScanArtifact(ctx: ActionCtx, id: string): Promise<ScanArtifact> {
  const text = z.string().parse(await load(ctx, { path: SCAN_ARTIFACT_OBJECT_PATH, name: id }))
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

export async function nextScanArtifactId(ctx: ActionCtx, afterId: string): Promise<string | null> {
  return await ctx.runQuery(internal.objects.locators.nextName, {
    path: SCAN_ARTIFACT_OBJECT_PATH,
    afterName: afterId,
  })
}
