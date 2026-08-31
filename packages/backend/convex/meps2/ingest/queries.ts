import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import type { ScanRef } from './shared'
import { nextAfterRow, nextBeforeRow, toScanRef, vScanRef, windowBound } from './shared'

const vScanRefOrNull = v.union(v.null(), vScanRef)

/**
 * Latest ingested scan artifact for this timeline. Empty window returns null.
 *
 * @throws {ConvexError} If the window bound has no scans row.
 */
export const latest = internalQuery({
  args: { path: v.string() },
  returns: vScanRefOrNull,
  handler: async (ctx, args): Promise<ScanRef | null> =>
    await windowBound(ctx, args.path, 'latest'),
})

/**
 * Earliest ingested scan artifact for this timeline. Empty window returns null.
 *
 * @throws {ConvexError} If the window bound has no scans row.
 */
export const earliest = internalQuery({
  args: { path: v.string() },
  returns: vScanRefOrNull,
  handler: async (ctx, args): Promise<ScanRef | null> =>
    await windowBound(ctx, args.path, 'earliest'),
})

/**
 * Next registered identity after `scan_at`. Null `scan_at` is the oldest registered.
 */
export const nextAfter = internalQuery({
  args: {
    path: v.string(),
    scan_at: v.union(v.string(), v.null()),
  },
  returns: vScanRefOrNull,
  handler: async (ctx, args): Promise<ScanRef | null> => {
    const row = await nextAfterRow(ctx, args.path, args.scan_at)
    return row === null ? null : toScanRef(row)
  },
})

/**
 * Previous registered identity before `scan_at`. Null `scan_at` is the newest registered.
 */
export const nextBefore = internalQuery({
  args: {
    path: v.string(),
    scan_at: v.union(v.string(), v.null()),
  },
  returns: vScanRefOrNull,
  handler: async (ctx, args): Promise<ScanRef | null> => {
    const row = await nextBeforeRow(ctx, args.path, args.scan_at)
    return row === null ? null : toScanRef(row)
  },
})
