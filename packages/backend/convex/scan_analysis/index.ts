import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { action, internalAction } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import * as scans from '#scans'

import { requireAdmin } from '../admin'
import { profileScan, viewScanReport } from './profile'
import type { ScanReport, ScanReportView } from './profile'

const selectionArgs = v.object({
  scanAt: v.optional(v.string()),
  scope: v.optional(v.union(v.literal('orca'), v.literal('collected'))),
})

/** Analyze one stored scan without persisting source data or reports. */
export const profile = internalAction({
  args: {
    ...selectionArgs.fields,
    paths: v.optional(v.array(v.string())),
    population: v.optional(
      v.union(v.literal('models'), v.literal('endpoints'), v.literal('providers')),
    ),
    valueLimit: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args): Promise<ScanReportView> =>
    viewScanReport(await analyze(ctx, args), args),
  // The generic package owns this derived JSON format; do not duplicate its types as a backend schema.
  returns: v.any(),
})

/** Full report for the admin explorer. JSON preserves JSONPath keys forbidden in Convex objects. */
export const report = action({
  args: selectionArgs.fields,
  handler: async (ctx, args): Promise<string> => {
    await requireAdmin(ctx)

    return JSON.stringify(await analyze(ctx, args))
  },
  returns: v.string(),
})

async function analyze(
  ctx: ActionCtx,
  { scanAt, scope = 'orca' }: Infer<typeof selectionArgs>,
): Promise<ScanReport> {
  const selected = scanAt === undefined || scanAt === 'latest' ? await scans.latest(ctx) : scanAt

  if (selected === null) {
    throw new ConvexError('No stored scans')
  }

  return profileScan(await scans.loadCollected(ctx, selected), { scope })
}
