import { ConvexError, v } from 'convex/values'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import { internalMutation } from '../../_generated/server'
import { CHANGE_EVENT_INPUTS_TABLE, entityChangeFields, ChangeEventInputContent } from '../schema'

/**
 * Accept inputs atomically, preserving existing evidence and processing state on matching retries.
 * Invalid intervals or conflicting evidence fail the entire batch; changed extraction requires a reset.
 */
export const storeChangeEventInputs = internalMutation({
  args: { inputs: v.array(entityChangeFields) },
  returns: v.null(),
  handler: async (ctx, { inputs }) => {
    for (const change of inputs) {
      // Validate the observation interval and decoded evidence before accepting or comparing input.
      z.iso.datetime().parse(change.scan_at)

      if (change.from_scan_at !== null) {
        z.iso.datetime().parse(change.from_scan_at)

        if (change.from_scan_at >= change.scan_at) {
          throw new ConvexError('Observation time must advance')
        }
      }

      const content = ChangeEventInputContent.parse(JSON.parse(change.content))

      // Retry identity uses the later scan, entity, and category; the earlier scan is checked below.
      const existing = await ctx.db
        .query(CHANGE_EVENT_INPUTS_TABLE)
        .withIndex('by_scan_at_and_entity_kind_and_entity_id_and_category', (q) =>
          q
            .eq('scan_at', change.scan_at)
            .eq('entity_kind', change.entity_kind)
            .eq('entity_id', change.entity_id)
            .eq('category', change.category),
        )
        .unique()

      // Insert new work, or require semantic agreement without reopening completed work.
      // Comparing decoded content ignores JSON object-key order while retaining value differences.
      if (existing === null) {
        await ctx.db.insert(CHANGE_EVENT_INPUTS_TABLE, { ...change, processed: false })
      } else if (
        existing.from_scan_at !== change.from_scan_at ||
        !isDeepEqual(ChangeEventInputContent.parse(JSON.parse(existing.content)), content)
      ) {
        throw new ConvexError(
          'Retry changed an accepted observation; reset before changing ingestion rules',
        )
      }
    }
    return null
  },
})
