import type { CoreModel } from '@orca/schema/archive-core.ts'

import type { EndpointEventContext, EventType, FieldChange } from '../projection/types.ts'

interface ProductEventBase {
  readonly crawlId: string
  readonly entityId: string
  readonly eventId: string
  readonly eventType: EventType
  readonly fields: readonly FieldChange[]
  readonly modelSlug: string
  readonly providerName: string | undefined
  readonly providerSlug: string | undefined
}

export type ProductEvent = ProductEventBase &
  (
    | { readonly context: EndpointEventContext; readonly entityType: 'endpoint' }
    | { readonly context: CoreModel; readonly entityType: 'model' }
  )

export interface MonitorBatch {
  readonly crawlId: string
  readonly events: readonly ProductEvent[]
  readonly observedAt: string
}

export interface MonitorPage {
  readonly batches: readonly MonitorBatch[]
  readonly nextBefore?: string
}

export interface MonitorPageOptions {
  readonly before?: string
  readonly limit: number
  readonly modelSlug?: string
  readonly providerName?: string
}

export const trackedPrices = [
  'completion',
  'input_cache_read',
  'input_cache_write',
  'input_cache_write_1h',
  'prompt',
] as const

export type TrackedPrice = (typeof trackedPrices)[number]
// Missing means unchanged at a sparse point; null explicitly removes a previously known price.
export type Pricing = Partial<Record<TrackedPrice, string | null>>

export interface PricingPoint {
  readonly at: number
  readonly available: boolean
  readonly pricing: Pricing
}

export interface PricingSeries {
  readonly availableFrom: number
  readonly endpointId: string
  readonly points: readonly PricingPoint[]
  readonly provider: {
    readonly displayName: string
    readonly name: string
    readonly slug: string
  }
  readonly unavailableAt?: number
}

export interface PricingHistory {
  readonly asOf: number
  readonly modelSlug: string
  readonly series: readonly PricingSeries[]
  readonly since: number
}

export type EndpointContext = EndpointEventContext
