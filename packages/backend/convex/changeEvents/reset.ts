import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'
import { CHANGE_EVENTS_TABLE, CHANGE_EVENT_INPUTS_TABLE } from './schema'

const RESET_PAGE_SIZE = 20
const RESET_MAX_BYTES_READ = 2_000_000

/**
 * Delete event history and retained inputs without rewinding scan ingestion or deleting scans.
 * Stop ingestion and processing first; each deletion page commits independently.
 */
export const reset = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // Remove events before their supporting inputs so surviving events retain their evidence.
    for (const table of [CHANGE_EVENTS_TABLE, CHANGE_EVENT_INPUTS_TABLE]) {
      while (!(await ctx.runMutation(internal.changeEvents.reset.clearPage, { table }))) {
        /* bounded reset transactions */
      }
    }
    return null
  },
})

/** Delete one bounded page; true means the scan reached the end, assuming no concurrent writers. */
export const clearPage = internalMutation({
  args: {
    table: v.union(v.literal(CHANGE_EVENTS_TABLE), v.literal(CHANGE_EVENT_INPUTS_TABLE)),
  },
  returns: v.boolean(),
  handler: async (ctx, { table }) => {
    // Convex permits one paginated query per transaction. The action advances between tables.
    const { page, isDone } = await ctx.db.query(table).paginate({
      cursor: null,
      numItems: RESET_PAGE_SIZE,
      maximumBytesRead: RESET_MAX_BYTES_READ,
    })
    for (const row of page) {
      await ctx.db.delete(table, row._id)
    }
    return isDone
  },
})
