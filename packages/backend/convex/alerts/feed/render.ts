import { paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { entityAlert } from '../shared/curate'
import type { EntityAlert } from '../shared/curate'
import { describe, summarize } from './text'

export const feedEvent = v.union(
  ...entityAlert.members.map((member) =>
    member.extend({ summary: v.string(), details: v.array(v.string()) }),
  ),
)
export const feedPage = paginationResultValidator(feedEvent)
export type FeedEvent = Infer<typeof feedEvent>

/** Add plain-text presentation to an already prepared entity alert. */
export function render(event: EntityAlert): FeedEvent {
  return { ...event, summary: summarize(event), details: describe(event) }
}
