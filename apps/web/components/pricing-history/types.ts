import type { api } from '@orca/backend/convex/_generated/api'
import type { PriceKey } from '@orca/backend/convex/shared/pricing'
import type { FunctionReturnType } from 'convex/server'

export type EndpointPricingHistory = FunctionReturnType<typeof api.endpointPricingHistory.get>
export type PricingMetric = PriceKey
