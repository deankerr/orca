/** Scan interface: discover and load validated captures as scoped entity observations. */
import { v } from 'convex/values'

import { internalAction } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import type { ScanArtifact } from '../../scan/artifact'
import { findPair, loadArtifact, loadPair as loadArtifacts } from './artifacts'
import { extractScan } from './extract'
import type { Scan, ScanPair } from './extract'
import { pairTimes } from './time'
import type { ScanPairTimes } from './time'

/** First capture at/after `from` and its successor; null means no complete pair yet. */
export async function loadNextPair(
  ctx: ActionCtx,
  from: string | null = null,
): Promise<ScanPair | null> {
  const times = await findPair(ctx, from)
  return times === null ? null : await loadPair(ctx, times)
}

/** Reload two exact captures, independently of later captures, for processing or retries. */
export async function loadPair(ctx: ActionCtx, times: ScanPairTimes): Promise<ScanPair> {
  const { previous, next } = await loadArtifacts(ctx, times)
  return { previous: extractArtifact(previous), next: extractArtifact(next) }
}

/** Load one exact capture. Missing or inconsistent captures fail. */
export async function load(ctx: ActionCtx, scanAt: string): Promise<Scan> {
  return extractArtifact(await loadArtifact(ctx, scanAt))
}

/** Read-only operator entry point; inspect selected capture times without loading their contents. */
export const selectPair = internalAction({
  args: { from: v.union(v.string(), v.null()) },
  returns: v.union(v.null(), pairTimes),
  handler: async (ctx, { from }) => await findPair(ctx, from),
})

function extractArtifact(artifact: ScanArtifact): Scan {
  return extractScan(artifact.scan_at, artifact.entries)
}
