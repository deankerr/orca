import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { internalAction, internalQuery } from '#generated/server'

import {
  CURRENT_MODELS_TABLE,
  CURRENT_PROVIDERS_TABLE,
  CURRENT_ENDPOINTS_TABLE,
} from '../catalog/tables/current'
import * as endpoints from './refresh/endpoints'
import * as models from './refresh/models'
import * as providers from './refresh/providers'
import { result } from './refresh/shared'

const entityKind = v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint'))
const target = v.object({ entity_kind: entityKind, entity_id: v.string() })

/** Enumerate refresh targets without loading their source captures or coupling their progress. */
export const targets = internalQuery({
  args: { entity_kind: entityKind, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(target),
  handler: async (ctx, { entity_kind, paginationOpts }) => {
    switch (entity_kind) {
      case 'model': {
        const result = await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id')
          .paginate(paginationOpts)
        return {
          ...result,
          page: result.page.map((row) => ({ entity_kind, entity_id: row.model_id })),
        }
      }
      case 'provider': {
        const result = await ctx.db
          .query(CURRENT_PROVIDERS_TABLE)
          .withIndex('by_provider_id')
          .paginate(paginationOpts)
        return {
          ...result,
          page: result.page.map((row) => ({ entity_kind, entity_id: row.provider_id })),
        }
      }
      case 'endpoint': {
        const result = await ctx.db
          .query(CURRENT_ENDPOINTS_TABLE)
          .withIndex('by_endpoint_id')
          .paginate(paginationOpts)
        return {
          ...result,
          page: result.page.map((row) => ({ entity_kind, entity_id: row.endpoint_id })),
        }
      }
      default: {
        throw new ConvexError('Unknown entity kind')
      }
    }
  },
})

/** Reproject current facts without replaying ingestion, history, or Events. */
export const refreshCurrentEntity = internalAction({
  args: target.fields,
  returns: target.extend(result.fields),
  handler: async (ctx, args) => {
    const refreshed = await {
      model: models.refresh,
      provider: providers.refresh,
      endpoint: endpoints.refresh,
    }[args.entity_kind](ctx, args.entity_id)
    return { ...args, ...refreshed }
  },
})
