import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Validator, Value } from 'convex/values'

/** All History reads retain native pagination options and pin an observation cutoff. */
export const pageArgs = { cutoff: v.optional(v.string()), paginationOpts: paginationOptsValidator }

export function pageResult<T extends Validator<Value, 'required', string>>(item: T) {
  return paginationResultValidator(item).extend({ as_of: v.union(v.null(), v.string()) })
}

/** No historical data is visible before the first completed ingestion. */
export function emptyPage() {
  return { page: [], isDone: true, continueCursor: '', as_of: null }
}
