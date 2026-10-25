import type { PaginationResult } from 'convex/server'
import { paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { entityAlert } from '../shared/alerts/curate'
import type { EntityAlert } from '../shared/alerts/curate'
import { describe, summarize } from './text'

const feedEvent = v.union(
  ...entityAlert.members.map((member) =>
    member.extend({ details: v.array(v.string()), summary: v.string() }),
  ),
)

export const feedPage = paginationResultValidator(feedEvent)

export type FeedEvent = Infer<typeof feedEvent>

/** Add plain-text presentation to an already prepared entity alert. */
export function render(event: EntityAlert): FeedEvent {
  return { ...event, details: describe(event), summary: summarize(event) }
}

export function renderPage(result: PaginationResult<EntityAlert>) {
  return { ...result, page: result.page.map(render) }
}
