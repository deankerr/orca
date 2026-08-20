import type { api } from '@orca/backend/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

import type { ShownPricingKey } from '@/lib/pricing-fields'

export type EndpointPricingHistory = FunctionReturnType<typeof api.endpointPricingHistory.get>
export type PricingMetric = ShownPricingKey
