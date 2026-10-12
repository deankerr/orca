import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScannedEndpoint, ScanPair } from '#scanNew/model'

import { encodePricing } from '../catalogNew/pricing'
import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../catalogNew/tables/current'
import type { CurrentEndpointRow } from '../catalogNew/tables/current'
import { compare } from '../compare'
import { endpointEntity } from './lenses'
import { commitStage } from './progress'
import type { InputId } from './table'
import { ingestionId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { previous, next }: ScanPair,
  ingestion_id: InputId,
): Promise<void> {
  const rows: Omit<CurrentEndpointRow, 'first_scan_at'>[] = []

  for (const [id, { endpoint }] of next.endpoints) {
    const previousEndpoint = previous.endpoints.get(id)
    const after = currentEndpoint(endpoint)

    if (
      previousEndpoint !== undefined &&
      compare(currentEndpoint(previousEndpoint.endpoint), after).length === 0
    ) {
      continue
    }

    const { metadata, pricing, ...facts } = after

    rows.push({
      ...facts,
      scan_at: next.scan_at,
      pricing: encodePricing(pricing),
      metadata_json: JSON.stringify(metadata),
    })
  }

  if (previous.scan_at !== null) {
    for (const [id, { endpoint }] of previous.endpoints) {
      if (next.endpoints.has(id)) {
        continue
      }

      const { metadata, pricing, ...facts } = currentEndpoint(endpoint)

      rows.push({
        ...facts,
        scan_at: previous.scan_at,
        unlisted_at: next.scan_at,
        pricing: encodePricing(pricing),
        metadata_json: JSON.stringify(metadata),
      })
    }
  }

  await ctx.runMutation(internal.ingestionNew.currentEndpoints.write, { ingestion_id, rows })
}

export const write = internalMutation({
  args: {
    ingestion_id: ingestionId,
    rows: v.array(currentEndpointsTable.validator.omit('first_scan_at')),
  },
  returns: v.null(),
  handler: async (ctx, { rows, ingestion_id }) => {
    await commitStage(ctx, ingestion_id, 'currentEndpoints', async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_ENDPOINTS_TABLE)
          .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
          .unique()

        if (
          existing !== null &&
          (row.unlisted_at ?? row.scan_at) <= (existing.unlisted_at ?? existing.scan_at)
        ) {
          continue
        }

        const next = { ...row, first_scan_at: existing?.first_scan_at ?? row.scan_at }

        await (existing === null
          ? ctx.db.insert(CURRENT_ENDPOINTS_TABLE, next)
          : ctx.db.replace(CURRENT_ENDPOINTS_TABLE, existing._id, next))
      }
    })

    return null
  },
})

const omittedMetadataKeys = new Set([
  'adapter_name',
  'allowed_passthrough_parameters',
  'can_abort',
  'capacity_tpm',
  'created_at',
  'declared_region',
  'deprecation_date',
  'display_pricing',
  'excluded_parameters',
  'is_byok',
  'is_byok_only',
  'is_free',
  'is_hidden',
  'is_hipaa_eligible',
  'is_pricing_unresolved',
  'is_private',
  'model_variant_permaslug',
  'model_variant_slug',
  'name',
  'pricing_json',
  'pricing_version_id',
  'provider_model_id',
  'provider_name',
  'provider_region',
  'server_tool_costs_discount_exempt',
  'supported_image_parameters',
  'supported_video_parameters',
  'supports_multipart',
  'supports_tool_parameters',
])

function currentEndpoint(endpoint: ScannedEndpoint) {
  const { metadata, ...fields } = endpointEntity(endpoint)

  return {
    ...fields,
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !omittedMetadataKeys.has(key)),
    ),
  }
}
