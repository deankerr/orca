import { internal } from '../_generated/api'
import { httpAction } from '../_generated/server'
import { renderFeed } from './markdown'

/** Serve the latest bounded event window as uncached, observation-grouped Markdown. */
export const serveFeed = httpAction(async (ctx) => {
  // ponytail: one latest window; add navigation when the product needs historical browsing.
  const events = await ctx.runQuery(internal.changeEvents.events.listRecentEvents, {})

  return new Response(renderFeed(events), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})

/** Expose a complete event with decoded JSON content; invalid or absent event IDs return 404. */
export const serveEventDetail = httpAction(async (ctx, request) => {
  const id = new URL(request.url).pathname.slice('/ces/events/'.length)
  const event = await ctx.runQuery(internal.changeEvents.events.getEvent, { id })
  const content: unknown = event === null ? null : JSON.parse(event.content)

  const body =
    event === null
      ? JSON.stringify({ error: 'Event not found' })
      : JSON.stringify({ ...event, content }, null, 2)
  return new Response(body, {
    status: event === null ? 404 : 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
