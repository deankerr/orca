import { v } from 'convex/values'

import { env, internalAction } from '../_generated/server'
import * as objects from '../objects'
import { profileScan, viewScanReport } from './profile'
import type { ScanReportView, Selection } from './profile'
import { loadScan } from './source'

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
    const scan = await loadScan(
      {
        load: async (identity) => await objects.load(ctx, identity),
        namesAtOrAfter: async (selection) => await objects.namesAtOrAfter(ctx, selection),
      },
      scanAt,
    )

    const { name } = await ctx.meta.getDeploymentMetadata()
    const selection: Selection = { scope }

    if (model !== undefined) {
      selection.model = model
    }

    if (provider !== undefined) {
      selection.provider = provider
    }

    const source = env.ORCA_OBJECTS_SOURCE_DEPLOYMENT
    const report = profileScan(
      scan,
      source === undefined || source === '' ? name : source,
      selection,
    )

    return viewScanReport(report, view)
  },
})
