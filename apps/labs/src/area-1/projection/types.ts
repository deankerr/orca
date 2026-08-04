import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'

export interface MaterializedEndpoint {
  readonly endpoint: CoreEndpoint
  readonly metrics: EndpointMetrics | undefined
  readonly modelSlug: string
}

export interface EndpointMetrics {
  readonly p50Latency?: number
  readonly p50Throughput?: number
}

export interface ProjectionBatch {
  readonly crawlId: string
  readonly endpoints: readonly MaterializedEndpoint[]
  readonly models: readonly CoreModel[]
}

export interface ProjectionState {
  readonly endpoints: ReadonlyMap<string, MaterializedEndpoint>
  readonly models: ReadonlyMap<string, CoreModel>
}

export type EntityType = 'endpoint' | 'model'
export type EventType = 'available' | 'baseline' | 'unavailable' | 'updated'

export interface FieldChange {
  readonly after: unknown
  readonly afterPresent: boolean
  readonly before: unknown
  readonly beforePresent: boolean
  readonly path: string
}

interface EventBase {
  readonly crawlId: string
  readonly entityId: string
  readonly eventId: string
  readonly eventType: EventType
  readonly fields: readonly FieldChange[]
  readonly modelSlug: string
  readonly previousCrawlId: string | undefined
  readonly providerName: string | undefined
  readonly providerSlug: string | undefined
}

export interface EndpointEventContext {
  readonly endpoint: CoreEndpoint
  readonly model: Pick<CoreModel, 'name' | 'slug'>
}

export type EntityEvent =
  | (EventBase & { readonly context: CoreModel; readonly entityType: 'model' })
  | (EventBase & { readonly context: EndpointEventContext; readonly entityType: 'endpoint' })

export interface CrawlPlan {
  readonly after: ProjectionState
  readonly batch: ProjectionBatch
  readonly events: readonly EntityEvent[]
  readonly previousCrawlId: string | undefined
}
