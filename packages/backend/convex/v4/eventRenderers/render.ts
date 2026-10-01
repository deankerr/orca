import { paginationResultValidator } from 'convex/server'
import type { PaginationResult } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import type { EventRow } from '../events/query'
import { curate, curatedEvent } from './curate'
import { shouldRender } from './filter'
import { describe, summarize } from './text'

export const feedEvent = v.union(
  ...curatedEvent.members.map((member) =>
    member.extend({ summary: v.string(), details: v.array(v.string()) }),
  ),
)
export const feedPage = paginationResultValidator(feedEvent)
export type FeedEvent = Infer<typeof feedEvent>

/** Interpret captured facts as structured changes and plain text, without reading current state. */
export function render(row: EventRow): FeedEvent | null {
  const event = curate(row)
  return event === null || !shouldRender(event)
    ? null
    : { ...event, summary: summarize(row), details: describe(event) }
}

/** Preserve source ordering and pagination even when selection removes every event in a page. */
export function renderPage(result: PaginationResult<EventRow>): PaginationResult<FeedEvent> {
  return {
    ...result,
    page: result.page.flatMap((row) => {
      const event = render(row)
      return event === null ? [] : [event]
    }),
  }
}
