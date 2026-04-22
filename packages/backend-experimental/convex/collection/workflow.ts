import { createFetch, createSchema } from '@better-fetch/fetch'
import { z } from 'zod'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { internalAction } from '../_generated/server'
import { parseEndpointBundle } from './parsers/endpoint'
import { parseModelBundle, parseModelIdentity } from './parsers/model'
import { parseProviderBundle, parseProviderIdentity } from './parsers/provider'

const DataRecordsSchema = z
  .object({ data: z.record(z.string(), z.unknown()).array() })
  .transform((value) => value.data)

const schema = createSchema({
  '/frontend/models': {
    method: 'get',
    output: DataRecordsSchema,
  },

  '/frontend/stats/endpoint': {
    method: 'get',
    query: z.object({
      permaslug: z.string(),
      variant: z.string(),
    }),
    output: DataRecordsSchema,
  },

  '/frontend/all-providers': {
    method: 'get',
    output: DataRecordsSchema,
  },
})

export const $fetch = createFetch({
  baseURL: 'https://openrouter.ai/api',
  schema,
  timeout: 15_000,
  retry: {
    type: 'exponential',
    attempts: 3,
    baseDelay: 1000,
    maxDelay: 9000,
  },
})

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return z.prettifyError(error)
  }

  return error instanceof Error ? error.message : String(error)
}

// Providers are independent from model and endpoint collection.
async function collectProviders(ctx: ActionCtx, args: { firstSeenAt: number }) {
  const items = await $fetch('/frontend/all-providers', { throw: true })

  const states = await ctx.runQuery(internal.providers.listAvailableStates, {})
  const availableIds = new Set(states.map((state) => state.id))

  for (const item of items) {
    const identity = parseProviderIdentity({ item })
    availableIds.delete(identity.id)

    try {
      const entity = parseProviderBundle({ item })

      await ctx.runMutation(internal.providers.ingest, {
        entity,
        firstSeenAt: args.firstSeenAt,
      })
    } catch (error) {
      console.error('failed to collect provider', {
        firstSeenAt: args.firstSeenAt,
        id: identity.id,
        error: getErrorMessage(error),
      })
    }
  }

  for (const id of availableIds) {
    await ctx.runMutation(internal.providers.setAvailability, {
      id,
      firstSeenAt: args.firstSeenAt,
      unavailableAt: args.firstSeenAt,
    })
  }
}

// Models and endpoints share a process so endpoints only run after their model is committed.
async function collectModels(ctx: ActionCtx, args: { firstSeenAt: number }) {
  const items = await $fetch('/frontend/models', { throw: true })

  const modelStates = await ctx.runQuery(internal.models.listAvailableStates, {})
  const availableModelIds = new Set(modelStates.map((state) => state.id))

  const endpointStates = await ctx.runQuery(internal.endpoints.listAvailableStates, {})
  const availableEndpointIds = new Set(endpointStates.map((state) => state.id))

  for (const item of items) {
    const identity = parseModelIdentity({ item })
    availableModelIds.delete(identity.id)

    try {
      const entity = parseModelBundle({ item })

      await ctx.runMutation(internal.models.ingest, {
        entity,
        firstSeenAt: args.firstSeenAt,
      })

      if (!identity.endpoint) {
        continue
      }

      await collectEndpoints(ctx, {
        model: {
          id: identity.id,
          endpoint: identity.endpoint,
        },
        firstSeenAt: args.firstSeenAt,
        availableEndpointIds,
      })
    } catch (error) {
      console.error('failed to collect model', {
        firstSeenAt: args.firstSeenAt,
        id: identity.id,
        error: getErrorMessage(error),
      })
    }
  }

  for (const id of availableModelIds) {
    await ctx.runMutation(internal.models.setAvailability, {
      id,
      firstSeenAt: args.firstSeenAt,
      unavailableAt: args.firstSeenAt,
    })
  }

  for (const id of availableEndpointIds) {
    await ctx.runMutation(internal.endpoints.setAvailability, {
      id,
      firstSeenAt: args.firstSeenAt,
      unavailableAt: args.firstSeenAt,
    })
  }
}

// Endpoints run one model at a time so fetch, parse, and commit share one failure boundary.
async function collectEndpoints(
  ctx: ActionCtx,
  args: {
    model: {
      id: string
      endpoint: {
        permaslug: string
        variant: string
      }
    }
    firstSeenAt: number
    availableEndpointIds: Set<string>
  },
) {
  try {
    const items = await $fetch('/frontend/stats/endpoint', {
      query: args.model.endpoint,
      throw: true,
    })

    const entities = items.map((item) => parseEndpointBundle({ item, modelId: args.model.id }))

    for (const entity of entities) {
      args.availableEndpointIds.delete(entity.id)

      await ctx.runMutation(internal.endpoints.ingest, {
        firstSeenAt: args.firstSeenAt,
        entity,
      })
    }
  } catch (error) {
    console.error('failed to collect model endpoints', {
      firstSeenAt: args.firstSeenAt,
      model: args.model,
      error: getErrorMessage(error),
    })
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const firstSeenAt = Date.now()

    const results = await Promise.allSettled([
      collectProviders(ctx, { firstSeenAt }),
      collectModels(ctx, { firstSeenAt }),
    ])

    for (const result of results) {
      if (result.status === 'fulfilled') {
        continue
      }

      console.error('failed to collect process', {
        firstSeenAt,
        error: getErrorMessage(result.reason),
      })
    }
  },
})
