import { v } from 'convex/values'
import type { Validator } from 'convex/values'

export const vPaginatedQueryReturn = <T extends Validator<any, any, any>>(returns: T) =>
  v.object({
    page: v.array(returns),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null()),
    ),
  })
