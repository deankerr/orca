import type { CoreModel } from '@orca/schema/archive-core.ts'

import { diffEntity } from './diff.ts'
import type {
  CrawlPlan,
  EndpointEventContext,
  EntityEvent,
  MaterializedEndpoint,
  ProjectionBatch,
  ProjectionState,
} from './types.ts'

const endpointContext = (
  item: MaterializedEndpoint,
  models: ReadonlyMap<string, CoreModel>,
): EndpointEventContext => {
  const model = models.get(item.modelSlug)
  if (model === undefined) {
    throw new Error(`endpoint ${item.endpoint.id} references missing model ${item.modelSlug}`)
  }
  return { endpoint: item.endpoint, model: { name: model.name, slug: model.slug } }
}

export const planCrawl = (
  before: ProjectionState,
  batch: ProjectionBatch,
  previousCrawlId?: string,
): CrawlPlan => {
  const after: ProjectionState = {
    endpoints: new Map(batch.endpoints.map((item) => [item.endpoint.id, item])),
    models: new Map(batch.models.map((model) => [model.slug, model])),
  }
  const events: EntityEvent[] = []

  for (const slug of [...new Set([...before.models.keys(), ...after.models.keys()])].toSorted()) {
    const oldModel = before.models.get(slug)
    const newModel = after.models.get(slug)
    const context = newModel ?? oldModel
    if (context === undefined) {
      continue
    }
    const event = diffEntity({
      after: newModel,
      before: oldModel,
      context,
      crawlId: batch.crawlId,
      entityId: slug,
      entityType: 'model',
      modelSlug: slug,
      previousCrawlId,
    })
    if (event !== undefined) {
      events.push(event)
    }
  }

  for (const id of [
    ...new Set([...before.endpoints.keys(), ...after.endpoints.keys()]),
  ].toSorted()) {
    const oldItem = before.endpoints.get(id)
    const newItem = after.endpoints.get(id)
    const item = newItem ?? oldItem
    if (item === undefined) {
      continue
    }
    const event = diffEntity({
      after: newItem?.endpoint,
      before: oldItem?.endpoint,
      context: endpointContext(item, newItem === undefined ? before.models : after.models),
      crawlId: batch.crawlId,
      entityId: id,
      entityType: 'endpoint',
      modelSlug: item.modelSlug,
      previousCrawlId,
      providerName: item.endpoint.provider_name,
      providerSlug: item.endpoint.provider_slug,
    })
    if (event !== undefined) {
      events.push(event)
    }
  }

  return { after, batch, events, previousCrawlId }
}
