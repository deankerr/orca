import { createFetch, createSchema } from '@better-fetch/fetch'
import { z } from 'zod'

import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { internalAction } from '../_generated/server'
import { createContentHash } from '../lib/hash'
import { rawEndpointIdentitySchema, rawEndpointTransformSchema } from './parsers/endpoint'
import { rawModelIdentitySchema, rawModelTransformSchema } from './parsers/model'
import { rawProviderIdentitySchema, rawProviderTransformSchema } from './parsers/provider'

type StateWithContentHash = {
  observedAt: number
  contentHash: string
  unavailableAt?: number
}

const schema = createSchema({
  '/frontend/models': {
    method: 'get',
    output: z.object({ data: rawModelIdentitySchema.array() }),
  },

  '/frontend/stats/endpoint': {
    method: 'get',
    output: z.object({ data: rawEndpointIdentitySchema.array() }),
    query: z.object({
      permaslug: z.string(),
      variant: z.string(),
    }),
  },

  '/frontend/all-providers': {
    method: 'get',
    output: z.object({ data: rawProviderIdentitySchema.array() }),
  },
})

export const $fetch = createFetch({
  baseURL: 'https://openrouter.ai/api',
  retry: {
    attempts: 3,
    baseDelay: 1000,
    maxDelay: 9000,
    type: 'exponential',
  },
  schema,
  timeout: 15_000,
})

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return z.prettifyError(error)
  }

  return error instanceof Error ? error.message : String(error)
}

// Keep the common no-change collection path out of mutation execution.
async function ingestCatalogEntity<Next extends { content: unknown }>(args: {
  commitFn: (args: { next: Next; observedAt: number; contentHash: string }) => Promise<unknown>
  currentState?: StateWithContentHash
  next: Next
  observedAt: number
}) {
  const contentHash = await createContentHash(args.next.content)
  const contentChanged = args.currentState?.contentHash !== contentHash
  const becameAvailable = args.currentState?.unavailableAt !== undefined
  const latestStateIsNotNewer =
    args.currentState === undefined || args.currentState.observedAt <= args.observedAt

  if (!contentChanged && !becameAvailable && latestStateIsNotNewer) {
    return
  }

  await args.commitFn({
    contentHash,
    next: args.next,
    observedAt: args.observedAt,
  })
}

// Providers are independent from model and endpoint collection.
async function collectProviders(ctx: ActionCtx, args: { observedAt: number }) {
  const { data: rawProviders } = await $fetch('/frontend/all-providers', { throw: true })
  const states = await ctx.runQuery(internal.providers.listStates, {})

  const unavailableProviderIds = states
    .filter(
      (state) =>
        state.unavailableAt === undefined &&
        !rawProviders.some((provider) => provider.id === state.entity.id),
    )
    .map((state) => state.entity.id)

  for (const { id, rawProvider } of rawProviders) {
    const providerEntity = rawProviderTransformSchema.safeParse(rawProvider)

    if (!providerEntity.success) {
      console.error('failed to parse provider', {
        error: getErrorMessage(providerEntity.error),
        id,
        observedAt: args.observedAt,
      })

      continue
    }

    await ingestCatalogEntity({
      commitFn: async (commitArgs) => ctx.runMutation(internal.providers.commit, commitArgs),
      currentState: states.find((state) => state.entity.id === id),
      next: providerEntity.data,
      observedAt: args.observedAt,
    })
  }

  if (unavailableProviderIds.length > 0) {
    await ctx.runMutation(internal.providers.markUnavailable, {
      ids: unavailableProviderIds,
      observedAt: args.observedAt,
    })
  }
}

// Models and endpoints share one process so the model-scoped endpoint crawl is
// kept beside the model availability flow it depends on.
async function collectModels(ctx: ActionCtx, args: { observedAt: number }) {
  const { data: rawModels } = await $fetch('/frontend/models', { throw: true })
  const modelStates = await ctx.runQuery(internal.models.listStates, {})
  const endpointStates = await ctx.runQuery(internal.endpoints.listStates, {})

  // endpoint availability tracking
  const observedEndpointIds = new Set<string>()
  const modelIdsWithFailedEndpointFetch = new Set<string>()

  for (const identity of rawModels) {
    // Ingest the model best-effort without stopping endpoint collection.
    const modelEntity = rawModelTransformSchema.safeParse(identity.rawModel)

    if (modelEntity.success) {
      await ingestCatalogEntity({
        commitFn: async (commitArgs) => ctx.runMutation(internal.models.commit, commitArgs),
        currentState: modelStates.find((state) => state.entity.id === identity.id),
        next: modelEntity.data,
        observedAt: args.observedAt,
      })
    } else {
      console.error('failed to parse model', {
        error: getErrorMessage(modelEntity.error),
        id: identity.id,
        observedAt: args.observedAt,
      })
    }

    // Skip endpoint collection when the model advertises no endpoint selector.
    if (!identity.endpoint) {
      continue
    }

    // Fetch endpoint identities for this model before full endpoint parsing.
    const endpointResult = await $fetch('/frontend/stats/endpoint', {
      query: identity.endpoint,
    })

    if (endpointResult.error) {
      console.error('failed to collect model endpoints', {
        error: getErrorMessage(endpointResult.error),
        model: {
          endpoint: identity.endpoint,
          id: identity.id,
        },
        observedAt: args.observedAt,
      })

      // A failed endpoint fetch leaves existing endpoint availability unchanged.
      modelIdsWithFailedEndpointFetch.add(identity.id)

      continue
    }

    const { data: rawEndpoints } = endpointResult.data

    // Ingest each endpoint best-effort without stopping the model loop.
    for (const { id, rawEndpoint } of rawEndpoints) {
      observedEndpointIds.add(id)

      const endpointEntity = rawEndpointTransformSchema.safeParse(rawEndpoint)

      if (!endpointEntity.success) {
        console.error('failed to parse endpoint', {
          error: getErrorMessage(endpointEntity.error),
          id,
          model: {
            endpoint: identity.endpoint,
            id: identity.id,
          },
          observedAt: args.observedAt,
        })

        continue
      }

      await ingestCatalogEntity({
        commitFn: async (commitArgs) => ctx.runMutation(internal.endpoints.commit, commitArgs),
        currentState: endpointStates.find((state) => state.entity.id === id),
        next: endpointEntity.data,
        observedAt: args.observedAt,
      })
    }
  }

  // Endpoint unavailability is derived once all model endpoint evidence is known.
  const unavailableEndpointIds = endpointStates
    .filter((state) => state.unavailableAt === undefined)
    .filter((state) => {
      const modelIdentity = rawModels.find((identity) => identity.id === state.entity.modelId)

      // model is unavailable
      if (!modelIdentity) {
        return true
      }

      // no endpoint selector means no endpoints available
      if (!modelIdentity.endpoint) {
        return true
      }

      // indeterminate status
      if (modelIdsWithFailedEndpointFetch.has(modelIdentity.id)) {
        return false
      }

      // we found these ones
      return !observedEndpointIds.has(state.entity.id)
    })
    .map((state) => state.entity.id)

  if (unavailableEndpointIds.length > 0) {
    await ctx.runMutation(internal.endpoints.markUnavailable, {
      ids: unavailableEndpointIds,
      observedAt: args.observedAt,
    })
  }

  // mark any missing model ids as unavailable
  const unavailableModelIds = modelStates
    .filter((state) => state.unavailableAt === undefined)
    .filter((state) => !rawModels.some((identity) => identity.id === state.entity.id))
    .map((state) => state.entity.id)

  if (unavailableModelIds.length > 0) {
    await ctx.runMutation(internal.models.markUnavailable, {
      ids: unavailableModelIds,
      observedAt: args.observedAt,
    })
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const observedAt = Date.now()

    const results = await Promise.allSettled([
      collectProviders(ctx, { observedAt }),
      collectModels(ctx, { observedAt }),
    ])

    for (const result of results) {
      if (result.status === 'fulfilled') {
        continue
      }

      console.error('failed to collect process', {
        error: getErrorMessage(result.reason),
        observedAt,
      })
    }
  },
})
