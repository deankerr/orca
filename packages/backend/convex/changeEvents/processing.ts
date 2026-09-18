import { getDocumentSize, v } from 'convex/values'

import { internal } from '../_generated/api'
import type { Doc } from '../_generated/dataModel'
import { internalAction, internalMutation } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import {
  CHANGE_EVENTS_TABLE,
  CHANGE_EVENT_INPUTS_TABLE,
  EntityChangeContent,
  ChangeEventInputContent,
} from './schema'

const PROCESSING_PAGE_SIZE = 100
// Each input is also rewritten as processed and copied to an event; leave write-budget headroom.
const PROCESSING_MAX_BYTES_READ = 2_000_000

/**
 * Visit unfinished inputs in separately committed pages, optionally for one scan.
 * Run one processor at a time; a failed run can restart from the remaining unfinished inputs.
 */
export const processPendingInputs = internalAction({
  args: { scan_at: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { scan_at }): Promise<null> => {
    let cursor: string | null = null
    let considered = 0
    while (true) {
      const result: { cursor: string; done: boolean; considered: number } = await ctx.runMutation(
        internal.changeEvents.processing.processPage,
        { cursor, scan_at },
      )

      considered += result.considered
      // Only cursor exhaustion ends a run, including an empty page before the end.
      if (result.done) {
        break
      }

      ;({ cursor } = result)
    }
    console.log('Change processing finished', { considered })
    return null
  },
})

/**
 * Process one unfinished-input page, optionally scoped to a single observation.
 * Each committed input is independently publishable, including after partial ingestion failures.
 */
export const processPage = internalMutation({
  args: { cursor: v.union(v.null(), v.string()), scan_at: v.optional(v.string()) },
  returns: v.object({ cursor: v.string(), done: v.boolean(), considered: v.number() }),
  handler: async (ctx, { cursor, scan_at }) => {
    const inputs = ctx.db.query(CHANGE_EVENT_INPUTS_TABLE)

    const pending =
      scan_at === undefined
        ? inputs.withIndex('by_processed', (q) => q.eq('processed', false))
        : inputs.withIndex('by_processed_and_scan_at', (q) =>
            q.eq('processed', false).eq('scan_at', scan_at),
          )

    const { page, continueCursor, isDone } = await pending.paginate({
      cursor,
      numItems: PROCESSING_PAGE_SIZE,
      maximumBytesRead: PROCESSING_MAX_BYTES_READ,
    })

    await applyRules(ctx, page)
    return { cursor: continueCursor, done: isDone, considered: page.length }
  },
})

/** Pass through each assignment as an event; creation and input completion commit together. */
async function applyRules(ctx: MutationCtx, changes: Doc<typeof CHANGE_EVENT_INPUTS_TABLE>[]) {
  let totalBytes = 0
  let maxBytes = 0
  for (const change of changes) {
    const { assigned, context } = ChangeEventInputContent.parse(JSON.parse(change.content))

    const event = {
      from_scan_at: change.from_scan_at,
      scan_at: change.scan_at,
      entity_kind: change.entity_kind,
      entity_id: change.entity_id,
      category: change.category,
      input_ids: [change._id],
      content: JSON.stringify(EntityChangeContent.parse({ changes: assigned, context })),
    }

    const bytes = getDocumentSize(event)
    totalBytes += bytes
    maxBytes = Math.max(maxBytes, bytes)
    await ctx.db.insert(CHANGE_EVENTS_TABLE, event)
    await ctx.db.patch(CHANGE_EVENT_INPUTS_TABLE, change._id, { processed: true })
  }
  console.log('Change events created', { events: changes.length, totalBytes, maxBytes })
}
