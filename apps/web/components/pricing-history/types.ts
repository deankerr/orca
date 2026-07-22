import type { api } from '@orca/backend/convex/_generated/api'
import type { PricingKey } from '@orca/backend/shared/formatters'
import type { FunctionReturnType } from 'convex/server'

export type EndpointPricingHistory = FunctionReturnType<typeof api.endpointPricingHistory.get>
export type PricingMetric = PricingKey
