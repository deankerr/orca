import * as R from 'remeda'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { Catalog, CatalogEndpoint, CatalogItem, CatalogProvider } from './catalog'
import { planCatalogProjection } from './compare'
import type { ProjectionLog, ProjectionPlan } from './compare'
import { appendCatalogPricing } from './pricing'

const CHUNK = 40

export async function projectCatalog(
  ctx: ActionCtx,
  args: { before: Catalog; after: Catalog; updated_at: number },
) {
  const plan = planCatalogProjection(args.before, args.after)

  logPlan('models', plan.models)
  logPlan('endpoints', plan.endpoints)
  logPlan('providers', plan.providers)

  const models = await applyRows(
    plan.models.upserts.map((item) => toModelRow(item, args.updated_at)),
    plan.models.deletes,
    async (batch) => await ctx.runMutation(internal.meps2.scan.queries.applyModels, batch),
  )

  const endpoints = await applyRows(
    plan.endpoints.upserts.map((endpoint) => toEndpointRow(endpoint, args.updated_at)),
    plan.endpoints.deletes,
    async (batch) => await ctx.runMutation(internal.meps2.scan.queries.applyEndpoints, batch),
  )

  const providers = await applyRows(
    plan.providers.upserts.map((provider) => toProviderRow(provider, args.updated_at)),
    plan.providers.deletes,
    async (batch) => await ctx.runMutation(internal.meps2.scan.queries.applyProviders, batch),
  )

  const pricing = await appendCatalogPricing(ctx, {
    endpoints: plan.pricing,
    timestamp: args.updated_at,
  })

  return { models, endpoints, providers, pricing }
}

function toModelRow(item: CatalogItem, updated_at: number) {
  // slug and endpoint stay on the file; they are not model table columns
  return {
    updated_at,
    model_id: item.model_id,
    variant: item.variant,
    permaslug: item.model.permaslug,
    input_modalities: item.model.input_modalities,
    output_modalities: item.model.output_modalities,
    or_created_at: item.model.or_created_at,
    display_name: item.model.display_name,
    author_display_name: item.model.author_display_name,
    metadata: item.model.metadata,
  }
}

function toEndpointRow(endpoint: CatalogEndpoint, updated_at: number) {
  return {
    updated_at,
    endpoint_id: endpoint.endpoint_id,
    model_id: endpoint.model_id,
    variant: endpoint.variant,
    provider_tag: endpoint.provider_tag,
    provider_id: endpoint.provider_id,
    metadata: endpoint.metadata,
  }
}

function toProviderRow(provider: CatalogProvider, updated_at: number) {
  return { ...provider, updated_at }
}

function logPlan(entity: string, plan: ProjectionPlan<unknown>) {
  console.log(`[meps2:project] ${entity}`, {
    upserts: plan.upserts.length,
    deletes: plan.deletes.length,
    creates: plan.log.filter((entry) => entry.kind === 'create').map((entry) => entry.id),
    updates: plan.log
      .filter((entry): entry is ProjectionLog & { kind: 'update' } => entry.kind === 'update')
      .map((entry) => ({ id: entry.id, changeset: entry.changeset })),
    deleted: plan.deletes,
  })
}

async function applyRows<Row>(
  upserts: Row[],
  deletes: string[],
  apply: (args: { upserts: Row[]; deletes: string[] }) => Promise<{
    upserted: number
    deleted: number
  }>,
) {
  const chunks = R.chunk(upserts, CHUNK)
  if (chunks.length === 0) {
    if (deletes.length === 0) {
      return { upserted: 0, deleted: 0 }
    }
    return await apply({ upserts: [], deletes })
  }

  let upserted = 0
  let deleted = 0
  for (const [index, chunk] of chunks.entries()) {
    const result = await apply({
      upserts: chunk,
      deletes: index === chunks.length - 1 ? deletes : [],
    })
    upserted += result.upserted
    deleted += result.deleted
  }
  return { upserted, deleted }
}
