import type { api } from '@orca/backend/convex/_generated/api'
import type { PricingKey } from '@orca/backend/convex/shared/formatters'
import type { FunctionReturnType } from 'convex/server'

export type Model = NonNullable<FunctionReturnType<typeof api.models.getBySlug>>
export type ModelEndpoint = FunctionReturnType<typeof api.endpoints.listForModel>[number]
export type PricingMetric = PricingKey
