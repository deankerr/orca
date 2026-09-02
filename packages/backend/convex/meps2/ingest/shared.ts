import { ConvexError, v } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../../_generated/server'

type DbCtx = QueryCtx | MutationCtx

/** Registered scan artifact identity. Callers pass this, never the JSONL. */
export type ScanRef = {
  /** Timeline. Live scan artifacts use `scan`. */
  path: string
  /** Opaque object name for `objects.load`. */
  artifact_id: string
  /** Observation identity and apply order. */
  scan_at: string
}

/** Validator for {@link ScanRef}. */
export const vScanRef = v.object({
  path: v.string(),
  artifact_id: v.string(),
  scan_at: v.string(),
})

/** Pick the identity fields off a scans row. */
export function toScanRef(row: { path: string; artifact_id: string; scan_at: string }): ScanRef {
  return { path: row.path, artifact_id: row.artifact_id, scan_at: row.scan_at }
}

/** Ingest window for this timeline, or null if nothing ingested. */
export async function getWindow(ctx: DbCtx, path: string) {
  return await ctx.db
    .query('meps2_ingest_window')
    .withIndex('by_path', (q) => q.eq('path', path))
    .unique()
}

/** Scans row at this `scan_at`, or null if unregistered. */
export async function getScanAt(ctx: DbCtx, path: string, scan_at: string) {
  return await ctx.db
    .query('meps2_scans')
    .withIndex('by_path_scan_at', (q) => q.eq('path', path).eq('scan_at', scan_at))
    .unique()
}

/** Scans row for this artifact pair, or null if unregistered. */
export async function getScanByArtifact(ctx: DbCtx, path: string, artifact_id: string) {
  return await ctx.db
    .query('meps2_scans')
    .withIndex('by_path_artifact_id', (q) => q.eq('path', path).eq('artifact_id', artifact_id))
    .unique()
}

/**
 * Next registered row after `scan_at`. `null` starts at the oldest registered.
 */
export async function nextAfterRow(ctx: DbCtx, path: string, scan_at: string | null) {
  const rows = await ctx.db
    .query('meps2_scans')
    .withIndex('by_path_scan_at', (q) =>
      scan_at === null ? q.eq('path', path) : q.eq('path', path).gt('scan_at', scan_at),
    )
    .order('asc')
    .take(1)

  return rows[0] ?? null
}

/**
 * Previous registered row before `scan_at`. `null` starts at the newest registered.
 */
export async function nextBeforeRow(ctx: DbCtx, path: string, scan_at: string | null) {
  const rows = await ctx.db
    .query('meps2_scans')
    .withIndex('by_path_scan_at', (q) =>
      scan_at === null ? q.eq('path', path) : q.eq('path', path).lt('scan_at', scan_at),
    )
    .order('desc')
    .take(1)

  return rows[0] ?? null
}

/**
 * Bound of the ingested window as a ScanRef.
 *
 * @returns The bound identity, or null if nothing ingested.
 * @throws {ConvexError} If the window names a `scan_at` with no scans row.
 */
export async function windowBound(
  ctx: DbCtx,
  path: string,
  which: 'earliest' | 'latest',
): Promise<ScanRef | null> {
  const window = await getWindow(ctx, path)

  if (window === null) {
    return null
  }

  const scan_at = which === 'earliest' ? window.earliest_scan_at : window.latest_scan_at
  const row = await getScanAt(ctx, path, scan_at)

  if (row === null) {
    throw new ConvexError({
      message: 'ingest window bound is missing from scans',
      path,
      scan_at,
    })
  }

  return toScanRef(row)
}
