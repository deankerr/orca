import { docValidator, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import { ingestionScanAt } from './clock'
import { processorName, processorWorkTable, V4_PROCESSOR_WORK_TABLE, workState } from './table'

/** Latest completed ingestion, or null before deployment bootstrap and the first pair. */
export const getIngestionScanAt = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => await ingestionScanAt(ctx),
})

/** Inspect outstanding or completed work; later successes do not hide earlier failures. */
export const listProcessorWork = internalQuery({
  args: { processor: processorName, state: workState, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(docValidator(V4_PROCESSOR_WORK_TABLE, processorWorkTable)),
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_PROCESSOR_WORK_TABLE)
      .withIndex('by_processor_and_state_and_scan_at', (q) =>
        q.eq('processor', args.processor).eq('state', args.state),
      )
      .paginate(args.paginationOpts),
})
