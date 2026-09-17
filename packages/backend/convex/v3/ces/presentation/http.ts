import { v } from 'convex/values'

import { internal } from '../../../_generated/api'
import { httpAction, internalQuery } from '../../../_generated/server'
import { renderEvent } from './markdown'

/** One bounded public feed window, ordered by event creation rather than source observation time. */
export const markdown = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // ponytail: one latest page; add navigation when the product needs historical browsing.
    const { page } = await ctx.db
      .query('ces_events')
      .order('desc')
      .paginate({ cursor: null, numItems: 100, maximumBytesRead: 6_000_000 })
    const entries = page.map(renderEvent)
    const introduction =
      page.length === 0
        ? 'No events yet.'
        : `Latest ${page.length} events, newest first. All times are UTC.`
    return `# ORCA change feed\n\n${introduction}\n\n${entries.join('\n\n---\n\n')}\n`
  },
})

/** Full event content and job lineage for inspecting anything summarized in the Markdown feed. */
export const eventDetail = internalQuery({
  args: { id: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { id }) => {
    const normalized = ctx.db.normalizeId('ces_events', id)
    if (normalized === null) {
      return null
    }
    const event = await ctx.db.get('ces_events', normalized)
    if (event === null) {
      return null
    }
    const content: unknown = JSON.parse(event.content)
    return JSON.stringify({ ...event, content }, null, 2)
  },
})

export const serveEvent = httpAction(async (ctx, request) => {
  const id = new URL(request.url).pathname.slice('/ces/events/'.length)
  const body: string | null = await ctx.runQuery(internal.v3.ces.presentation.http.eventDetail, {
    id,
  })
  return new Response(body ?? JSON.stringify({ error: 'Event not found' }), {
    status: body === null ? 404 : 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})

export const serve = httpAction(async (ctx) => {
  const body: string = await ctx.runQuery(internal.v3.ces.presentation.http.markdown, {})
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
