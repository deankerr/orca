import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Validator, Value } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { clock } from '../clock'
import { assertScanAt } from '../scan/time'

/** All History reads retain native pagination options and pin an observation cutoff. */
export const pageArgs = { cutoff: v.optional(v.string()), paginationOpts: paginationOptsValidator }

/** The shared clock bounds observation time, not processor completeness. */
export async function cappedCutoff(ctx: QueryCtx, requested?: string): Promise<string | null> {
  if (requested !== undefined) {
    assertScanAt(requested)
  }
  const scanAt = await clock(ctx)
  if (scanAt === null) {
    return null
  }
  return requested !== undefined && requested < scanAt ? requested : scanAt
}

export function pageResult<T extends Validator<Value, 'required', string>>(item: T) {
  return paginationResultValidator(item).extend({ as_of: v.union(v.null(), v.string()) })
}

/** Empty result for a timeline without a released observation. */
export function emptyPage() {
  return { page: [], isDone: true, continueCursor: '', as_of: null }
}
