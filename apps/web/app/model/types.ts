import type { api } from '@orca/backend/convex/_generated/api'
import type { PriceKey } from '@orca/backend/convex/shared/pricing'
import type { FunctionReturnType } from 'convex/server'

export type Model = NonNullable<FunctionReturnType<typeof api.models.getBySlug>>
export type ModelEndpoint = FunctionReturnType<typeof api.endpoints.listForModel>[number]
export type PricingMetric = PriceKey
