import { docValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from '../../_generated/server'
import { eventsTable, V4_EVENTS_TABLE } from './table'

/** A small feed of the latest stored events, in write order. */
export const list = query({
  args: {},
  returns: v.array(docValidator(V4_EVENTS_TABLE, eventsTable)),
  handler: async (ctx) => await ctx.db.query(V4_EVENTS_TABLE).order('desc').take(100),
})
