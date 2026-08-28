import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { pricingTable } from '../tables/pricing'
import type { CatalogEndpoint } from './catalog'

const CHUNK = 40

type PricingRow = Infer<typeof pricingTable.validator>

const OPTIONAL_METERS = [
  'image',
  'image_output',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
  'audio',
  'input_audio_cache',
  'web_search',
] as const

export function collectPricingRows(endpoints: CatalogEndpoint[], timestamp: number): PricingRow[] {
  const rows: PricingRow[] = []

  for (const endpoint of endpoints) {
    const row = toPricingRow(endpoint, timestamp)
    if (row !== null) {
      rows.push(row)
    }
  }

  return rows
}

export async function appendCatalogPricing(
  ctx: ActionCtx,
  args: { endpoints: CatalogEndpoint[]; timestamp: number },
) {
  const rows = collectPricingRows(args.endpoints, args.timestamp)
  const chunks = R.chunk(rows, CHUNK)

  let inserted = 0
  for (const chunk of chunks) {
    const result = await ctx.runMutation(internal.meps2.scan.queries.appendPricing, {
      rows: chunk,
    })
    inserted += result.inserted
  }

  console.log('[meps2:project] pricing', { inserted })
  return { inserted }
}

function toPricingRow(endpoint: CatalogEndpoint, timestamp: number): PricingRow | null {
  const { pricing } = endpoint
  if (pricing === null) {
    return null
  }

  const row: PricingRow = {
    endpoint_id: endpoint.endpoint_id,
    timestamp,
    prompt: pricing.prompt,
    completion: pricing.completion,
    discount: pricing.discount,
  }

  for (const key of OPTIONAL_METERS) {
    const value = pricing[key]
    if (value !== undefined) {
      row[key] = value
    }
  }

  if (pricing.display_pricing !== undefined) {
    row.display_pricing = pricing.display_pricing
  }
  if (pricing.overrides !== undefined) {
    row.overrides = pricing.overrides
  }

  return row
}
