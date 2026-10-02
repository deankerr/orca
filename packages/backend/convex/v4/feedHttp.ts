import type { PaginationResult } from 'convex/server'
import { z } from 'zod'

import { api } from '../_generated/api'
import { httpAction } from '../_generated/server'
import type { FeedEvent } from './alerts/renderers/json'

const parameters = z
  .strictObject({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
    entity_kind: z.enum(['model', 'provider', 'endpoint']).optional(),
    entity_id: z.string().min(1).optional(),
    model_id: z.string().min(1).optional(),
    provider_id: z.string().min(1).optional(),
  })
  .refine((args) => (args.entity_kind === undefined) === (args.entity_id === undefined), {
    message: 'Supply entity_kind and entity_id together.',
  })
  .refine(
    (args) =>
      [args.entity_id, args.model_id, args.provider_id].filter((id) => id !== undefined).length <=
      1,
    {
      message: 'Choose one filter: an exact entity, a model, or a provider.',
    },
  )

/** Experimental GET feed: native seek cursors are carried by ordinary continuation URLs. */
export const serve = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const parsed = parameters.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 })
  }
  const args = parsed.data
  const paginationOpts = { numItems: args.limit, cursor: args.cursor ?? null }
  let result: PaginationResult<FeedEvent>
  try {
    if (args.entity_kind !== undefined && args.entity_id !== undefined) {
      result = await ctx.runQuery(api.v4.feed.byEntity, {
        entity_kind: args.entity_kind,
        entity_id: args.entity_id,
        paginationOpts,
      })
    } else if (args.model_id !== undefined) {
      result = await ctx.runQuery(api.v4.feed.byModel, {
        model_id: args.model_id,
        paginationOpts,
      })
    } else if (args.provider_id === undefined) {
      result = await ctx.runQuery(api.v4.feed.list, { paginationOpts })
    } else {
      result = await ctx.runQuery(api.v4.feed.byProvider, {
        provider_id: args.provider_id,
        paginationOpts,
      })
    }
  } catch (error) {
    // Convex's cursor failures cross runQuery as Error messages, without a public error type.
    if (
      args.cursor !== undefined &&
      error instanceof Error &&
      /InvalidCursor|Failed to parse cursor/.test(error.message)
    ) {
      return Response.json(
        { error: 'Invalid cursor. Restart from the feed without a cursor.' },
        { status: 400 },
      )
    }
    console.error('[v4:feed] read failed', error)
    return Response.json({ error: 'Unable to read the feed.' }, { status: 500 })
  }
  url.searchParams.set('cursor', result.continueCursor)
  const next = result.isDone ? null : url.href
  const headers = {
    'Cache-Control': 'no-store',
    ...(next === null ? {} : { Link: `<${next}>; rel="next"` }),
  }
  return new Response(JSON.stringify({ events: result.page, next }, null, 2), {
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  })
})
