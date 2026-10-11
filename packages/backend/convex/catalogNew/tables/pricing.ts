import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { pricing } from '../pricing'

export const ENDPOINT_PRICES_TABLE = 'catalog_pricing_history' as const

/** Complete quote at a baseline or quote change; continues until the next quote transition. */
export const endpointPricesTable = defineTable({
  endpoint_id: v.string(),
  scan_at: v.string(),
  ...pricing.fields,
}).index('by_endpoint_id_and_scan_at', ['endpoint_id', 'scan_at'])

export type EndpointPriceRow = Infer<typeof endpointPricesTable.validator>
