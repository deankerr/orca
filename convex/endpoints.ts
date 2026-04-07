import { v } from 'convex/values'
import * as R from 'remeda'

import { query } from './_generated/server'
import { db } from './db'
import { transformEndpoints } from './db/or/views/endpoints'

export const list = query({
  args: {
    maxTimeUnavailable: v.optional(v.number()),
  },
  handler: async (ctx, { maxTimeUnavailable }) => {
    const endpoints = await db.or.views.endpoints.collect(ctx).then(transformEndpoints)

    // If no filter specified, return all endpoints
    if (!R.isDefined(maxTimeUnavailable)) {
      return endpoints
    }

    // * Find latest updated_at to use as "current time"
    let currentTime = 0
    for (const endp of endpoints) {
      if (R.isDefined(endp.updated_at) && endp.updated_at > currentTime) {
        currentTime = endp.updated_at
      }
    }

    // * Filter: keep available endpoints or recently unavailable ones
    return endpoints.filter(
      (endp) =>
        !R.isDefined(endp.unavailable_at) ||
        endp.unavailable_at >= currentTime - maxTimeUnavailable,
    )
  },
})
