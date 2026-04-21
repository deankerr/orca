import { createFetch, createSchema } from '@better-fetch/fetch'
import { z } from 'zod'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { internalAction } from '../_generated/server'
import { parseEndpointBundle } from './endpoint'
import { parseModelBundle, parseModelIdentity } from './model'
import { parseProviderBundle, parseProviderIdentity } from './provider'

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

type EndpointTarget = {
  permaslug: string
  variant: string
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return z.prettifyError(error)
  }

  return error instanceof Error ? error.message : String(error)
}

// Providers parse in the action and commit one entity per mutation.
async function collectProviders(
  ctx: ActionCtx,
  args: {
    items: Record<string, unknown>[]
    firstSeenAt: number
  },
) {
  for (const item of args.items) {
    const identity = parseProviderIdentity({ item })

    try {
      const entity = parseProviderBundle({ item })
      await ctx.runMutation(internal.ingest.providers, {
        entity,
        firstSeenAt: args.firstSeenAt,
      })
    } catch (error) {
      const message = getErrorMessage(error)

      console.error('[ingestion:collect] failed to collect provider', {
        firstSeenAt: args.firstSeenAt,
        id: identity.id,
        error: message,
      })
    }
  }
}

// Models also surface endpoint targets for the follow-up endpoint collection phase.
async function collectModels(
  ctx: ActionCtx,
  args: {
    items: Record<string, unknown>[]
    firstSeenAt: number
  },
): Promise<EndpointTarget[]> {
  const endpointTargets: EndpointTarget[] = []

  for (const item of args.items) {
    const identity = parseModelIdentity({ item })

    if (identity.target) {
      endpointTargets.push(identity.target)
    }

    try {
      const entity = parseModelBundle({ item })
      await ctx.runMutation(internal.ingest.models, {
        entity,
        firstSeenAt: args.firstSeenAt,
      })
    } catch (error) {
      const message = getErrorMessage(error)

      console.error('[ingestion:collect] failed to collect model', {
        firstSeenAt: args.firstSeenAt,
        id: identity.id,
        error: message,
      })
    }
  }

  return endpointTargets
}

// Endpoints now run one target at a time so fetch, parse, and commit share one failure boundary.
async function collectEndpoints(
  ctx: ActionCtx,
  args: {
    targets: EndpointTarget[]
    firstSeenAt: number
  },
) {
  for (const target of args.targets) {
    try {
      const items = await $fetch('/frontend/stats/endpoint', {
        query: {
          permaslug: target.permaslug,
          variant: target.variant,
        },
        throw: true,
      })

      const entities = items.map((item) => parseEndpointBundle({ item }))
      const states = await ctx.runQuery(internal.endpoints.listStatesByModel, {
        modelVersionSlug: target.permaslug,
        modelVariant: target.variant,
      })
      const currentlyAvailableIds = new Set(
        states.filter((state) => state.unavailableAt === undefined).map((state) => state.id),
      )

      for (const entity of entities) {
        currentlyAvailableIds.delete(entity.id)

        await ctx.runMutation(internal.endpoints.ingest, {
          firstSeenAt: args.firstSeenAt,
          entity,
        })
      }

      for (const id of currentlyAvailableIds) {
        await ctx.runMutation(internal.endpoints.setAvailability, {
          id,
          firstSeenAt: args.firstSeenAt,
          unavailableAt: args.firstSeenAt,
        })
      }
    } catch (error) {
      const message = getErrorMessage(error)

      console.error('[ingestion:collect] failed to collect endpoint target', {
        firstSeenAt: args.firstSeenAt,
        permaslug: target.permaslug,
        variant: target.variant,
        error: message,
      })
    }
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const firstSeenAt = Date.now()

    const [providerItems, modelItems] = await Promise.all([
      $fetch('/frontend/all-providers', { throw: true }),
      $fetch('/frontend/models', { throw: true }),
    ])

    await collectProviders(ctx, {
      items: providerItems,
      firstSeenAt,
    })

    const endpointTargets = await collectModels(ctx, {
      items: modelItems,
      firstSeenAt,
    })

    await collectEndpoints(ctx, {
      targets: endpointTargets,
      firstSeenAt,
    })
  },
})
