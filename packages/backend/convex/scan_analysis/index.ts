import { v } from 'convex/values'

import { internalAction } from '#generated/server'

import { reader } from '../scan'
import { scanAtFromReference } from '../scan/objects'
import { profileScan, viewScanReport } from './profile'
import type { ScanReportView, Selection } from './profile'

/** Analyze one stored scan without persisting source data or reports. */
export const profile = internalAction({
  args: {
    scanAt: v.optional(v.string()),
    scope: v.optional(v.union(v.literal('orca'), v.literal('collected'))),
    model: v.optional(v.string()),
    provider: v.optional(v.string()),
    population: v.optional(
      v.union(v.literal('models'), v.literal('endpoints'), v.literal('providers')),
    ),
    paths: v.optional(v.array(v.string())),
    valueLimit: v.optional(v.union(v.number(), v.null())),
  },
  // The generic package owns this derived JSON format; do not duplicate its types as a backend schema.
  returns: v.any(),
  handler: async (
    ctx,
    { scanAt, scope = 'orca', model, provider, ...view },
  ): Promise<ScanReportView> => {
    const scan = await reader(ctx).loadRaw(
      scanAt === undefined || scanAt === 'latest' ? undefined : scanAtFromReference(scanAt),
    )

    const selection: Selection = { scope }

    if (model !== undefined) {
      selection.model = model
    }

    if (provider !== undefined) {
      selection.provider = provider
    }

    const report = profileScan(scan, selection)

    return viewScanReport(report, view)
  },
})
