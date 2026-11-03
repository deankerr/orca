import { v } from 'convex/values'

import { query } from './_generated/server'

export const get = query({
  args: {},
  handler: () => 'Hello from Convex',
  returns: v.string(),
})
