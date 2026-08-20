import type { api } from '@orca/backend/convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'

import type { ShownPricingKey } from '@/lib/pricing-fields'

export type Model = NonNullable<FunctionReturnType<typeof api.models.getBySlug>>
export type ModelEndpoint = FunctionReturnType<typeof api.endpoints.listForModel>[number]
export type PricingMetric = ShownPricingKey
