import { docValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '../_generated/server'
import { CHANGE_EVENTS_TABLE, changeEventsTable } from './schema'

const RECENT_EVENTS_PAGE_SIZE = 100
const RECENT_EVENTS_MAX_BYTES_READ = 6_000_000

/** Read the latest observation-ordered window; the byte budget can shorten the item target. */
export const listRecentEvents = internalQuery({
  args: {},
  returns: v.array(docValidator(CHANGE_EVENTS_TABLE, changeEventsTable)),
  handler: async (ctx) => {
    const { page } = await ctx.db
      .query(CHANGE_EVENTS_TABLE)
      .withIndex('by_scan_at')
      .order('desc')
      .paginate({
        cursor: null,
        numItems: RECENT_EVENTS_PAGE_SIZE,
        maximumBytesRead: RECENT_EVENTS_MAX_BYTES_READ,
      })
    return page
  },
})

/** Invalid or missing event IDs resolve to null for consumers to present appropriately. */
export const getEvent = internalQuery({
  args: { id: v.string() },
  returns: v.union(v.null(), docValidator(CHANGE_EVENTS_TABLE, changeEventsTable)),
  handler: async (ctx, { id }) => {
    const normalized = ctx.db.normalizeId(CHANGE_EVENTS_TABLE, id)
    return normalized === null ? null : await ctx.db.get(CHANGE_EVENTS_TABLE, normalized)
  },
})
