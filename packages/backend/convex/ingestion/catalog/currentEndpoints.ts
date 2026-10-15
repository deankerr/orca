import { v } from 'convex/values'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { encodePricing } from '../../catalog/pricing'
import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalog/tables/current'
import type { CurrentEndpointRow } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { endpointEntity } from '../lenses'
import { commitResult } from '../results'

const omittedMetadataKeys = [
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
] as const

export const ingest: Ingestor = createIngestor({
  process: 'currentEndpoints',
  prepare(_ctx, { previous, next, has_later_scan }) {
    const endpoints = has_later_scan ? [] : [...next.endpoints]

    for (const [id, endpoint] of previous.endpoints) {
      if (!next.endpoints.has(id)) {
        endpoints.push([id, endpoint])
      }
    }

    const rows = endpoints.map(([id, endpoint]) => {
      const { metadata, pricing, ...fields } = endpointEntity(endpoint)
      const row: CurrentEndpointRow = {
        ...fields,
        scan_at: next.scan_at,
        pricing: encodePricing(pricing),
        metadata_json: JSON.stringify(R.omit(metadata, omittedMetadataKeys)),
      }

      if (!next.endpoints.has(id)) {
        row.unlisted_at = next.scan_at
      }

      return row
    })

    return { scan_at: next.scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentEndpoints.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    rows: v.array(currentEndpointsTable.validator),
  },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_ENDPOINTS_TABLE)
          .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
          .unique()

        if (existing !== null && row.scan_at <= existing.scan_at) {
          continue
        }

        await (existing === null
          ? ctx.db.insert(CURRENT_ENDPOINTS_TABLE, row)
          : ctx.db.replace(CURRENT_ENDPOINTS_TABLE, existing._id, row))
      }
    }),
})
