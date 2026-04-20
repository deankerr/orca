import { createFetch, createSchema } from '@better-fetch/fetch'
import * as R from 'remeda'
import { z } from 'zod'

import { api } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import { internalAction } from '../_generated/server'
import { createIngestSummary } from './shared'
import type { IngestSummary } from './shared'

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

type CollectResult = {
  firstSeenAt: number
  providers: IngestSummary
  models: IngestSummary
  endpoints: IngestSummary
  endpointRequests: {
    total: number
    failed: Array<
      EndpointTarget & {
        error: string
      }
    >
  }
}

const providersUrl = 'https://openrouter.ai/api/frontend/all-providers'
const modelsUrl = 'https://openrouter.ai/api/frontend/models'
const endpointStatsUrl = 'https://openrouter.ai/api/frontend/stats/endpoint'

const EndpointTargetsSchema = z
  .array(
    z.object({
      permaslug: z.string(),
      endpoint: z
        .object({
          variant: z.string(),
        })
        .nullable(),
    }),
  )
  .transform((items) =>
    items.flatMap((item) =>
      item.endpoint === null ? [] : [{ permaslug: item.permaslug, variant: item.endpoint.variant }],
    ),
  )

function mergeIngestSummary(total: IngestSummary, next: IngestSummary) {
  total.processed += next.processed
  total.changed += next.changed
  total.unchanged += next.unchanged
  total.failed += next.failed
}

function createEndpointRequestUrl(target: EndpointTarget) {
  const url = new URL(endpointStatsUrl)
  url.searchParams.set('permaslug', target.permaslug)
  url.searchParams.set('variant', target.variant)
  return url.toString()
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function fetchEndpointBundle(target: EndpointTarget): Promise<
  | {
      ok: true
      target: EndpointTarget
      items: Record<string, unknown>[]
    }
  | {
      ok: false
      target: EndpointTarget
      error: string
    }
> {
  try {
    const items = await $fetch('/frontend/stats/endpoint', {
      query: {
        permaslug: target.permaslug,
        variant: target.variant,
      },
      throw: true,
    })

    return {
      ok: true,
      target,
      items,
    }
  } catch (error) {
    return {
      ok: false,
      target,
      error: getErrorMessage(error),
    }
  }
}

async function collectEndpoints(
  ctx: ActionCtx,
  args: {
    targets: EndpointTarget[]
    firstSeenAt: number
  },
): Promise<{
  summary: IngestSummary
  failedTargets: CollectResult['endpointRequests']['failed']
}> {
  const summary = createIngestSummary()
  const failedTargets: CollectResult['endpointRequests']['failed'] = []

  for (const batch of R.chunk(args.targets, 10)) {
    const results = await Promise.all(batch.map(fetchEndpointBundle))

    for (const result of results) {
      if (!result.ok) {
        const failedTarget: CollectResult['endpointRequests']['failed'][number] = {
          permaslug: result.target.permaslug,
          variant: result.target.variant,
          error: result.error,
        }
        failedTargets.push(failedTarget)
        console.log('[ingestion:collect] failed to fetch endpoint bundle', failedTarget)
        continue
      }

      const nextSummary = await ctx.runMutation(api.ingest.endpoints, {
        items: result.items,
        firstSeenAt: args.firstSeenAt,
        source: {
          locator: createEndpointRequestUrl(result.target),
        },
      })
      mergeIngestSummary(summary, nextSummary)
    }
  }

  return {
    summary,
    failedTargets,
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<CollectResult> => {
    const firstSeenAt = Date.now()

    const [providerItems, modelItems] = await Promise.all([
      $fetch('/frontend/all-providers', { throw: true }),
      $fetch('/frontend/models', { throw: true }),
    ])

    const providers: IngestSummary = await ctx.runMutation(api.ingest.providers, {
      items: providerItems,
      firstSeenAt,
      source: {
        locator: providersUrl,
      },
    })

    const models: IngestSummary = await ctx.runMutation(api.ingest.models, {
      items: modelItems,
      firstSeenAt,
      source: {
        locator: modelsUrl,
      },
    })

    const targets = EndpointTargetsSchema.parse(modelItems)
    const endpointCollection = await collectEndpoints(ctx, { targets, firstSeenAt })

    return {
      firstSeenAt,
      providers,
      models,
      endpoints: endpointCollection.summary,
      endpointRequests: {
        total: targets.length,
        failed: endpointCollection.failedTargets,
      },
    }
  },
})
