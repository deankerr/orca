import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internalAction } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import * as scans from '#scan'

import { profileScan, viewScanReport } from './profile'
import type { ScanReport, ScanReportView, Selection } from './profile'

const selectionArgs = v.object({
  scanAt: v.optional(v.string()),
  scope: v.optional(v.union(v.literal('orca'), v.literal('collected'))),
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
})

/** Analyze one stored scan without persisting source data or reports. */
export const profile = internalAction({
  args: {
    ...selectionArgs.fields,
    population: v.optional(
      v.union(v.literal('models'), v.literal('endpoints'), v.literal('providers')),
    ),
    paths: v.optional(v.array(v.string())),
    valueLimit: v.optional(v.union(v.number(), v.null())),
  },
  // The generic package owns this derived JSON format; do not duplicate its types as a backend schema.
  returns: v.any(),
  handler: async (ctx, args): Promise<ScanReportView> =>
    viewScanReport(await analyze(ctx, args), args),
})

/** Full report for the local HTML renderer. JSON preserves JSONPath keys forbidden in Convex objects. */
export const report = internalAction({
  args: selectionArgs.fields,
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => JSON.stringify(await analyze(ctx, args)),
})

async function analyze(
  ctx: ActionCtx,
  { scanAt, scope = 'orca', model, provider }: Infer<typeof selectionArgs>,
): Promise<ScanReport> {
  const scan = await scans.reader(ctx).loadCollected(scanAt === 'latest' ? undefined : scanAt)
  const selection: Selection = { scope }

  if (model !== undefined) {
    selection.model = model
  }

  if (provider !== undefined) {
    selection.provider = provider
  }

  return profileScan(scan, selection)
}
