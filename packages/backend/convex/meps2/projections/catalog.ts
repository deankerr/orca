import type { ActionCtx } from '../../_generated/server'
import type { Catalog } from '../catalog/v1'
import { projectEndpoints } from './endpoints'
import { projectModels } from './models'
import { projectProviders } from './providers'

export async function projectCatalog(
  ctx: ActionCtx,
  args: { before: Catalog; after: Catalog; timestamp: number },
) {
  const models = await projectModels(ctx, {
    before: args.before.models,
    after: args.after.models,
    timestamp: args.timestamp,
  })
  const endpoints = await projectEndpoints(ctx, {
    before: args.before.endpoints,
    after: args.after.endpoints,
    timestamp: args.timestamp,
  })
  const providers = await projectProviders(ctx, {
    before: args.before.providers,
    after: args.after.providers,
    timestamp: args.timestamp,
  })

  return { models, endpoints, providers }
}
