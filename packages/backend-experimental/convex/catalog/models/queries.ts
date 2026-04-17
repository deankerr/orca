import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

type ModelVersion = Doc<'catalog_models'>
type ModelDescriptionVersion = Doc<'catalog_model_descriptions'>

async function getModel(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_models')
    .withIndex('by_id__firstSeenAt', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

async function getModelDescription(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_model_descriptions')
    .withIndex('by_id__firstSeenAt', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

function withDescription(model: ModelVersion, description: ModelDescriptionVersion) {
  return {
    ...model,
    description: description.description,
  }
}

async function withCurrentDescription(
  ctx: QueryCtx,
  model: ModelVersion,
): Promise<ReturnType<typeof withDescription>> {
  const description = await getModelDescription(ctx, model.id)

  if (!description) {
    throw new Error(`Missing model description row for model id "${model.id}"`)
  }

  return withDescription(model, description)
}

export const get = defineQuerySpec({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const model = await getModel(ctx, args.id)

    if (!model) {
      return null
    }

    return withCurrentDescription(ctx, model)
  },
})

export const list = defineQuerySpec({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_models')
      .withIndex('by_id__firstSeenAt')
      .order('desc')
      .distinct(['id'])
      .map(async (model) => withCurrentDescription(ctx, model))
      .paginate(args.paginationOpts),
})
