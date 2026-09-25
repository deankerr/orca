import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../_generated/server'
import { loadPair } from '../scan'
import { activeProcessors, getProcessor } from './registry'
import {
  ingestionsTable,
  processorWorkTable,
  V4_INGESTIONS_TABLE,
  V4_PROCESSOR_WORK_TABLE,
} from './table'
import { findWork } from './work'

/** One shared pair load for this ingestion's processors; no dependency on other ingestions. */
export const processIngestion = internalAction({
  args: { ingestion_id: v.id(V4_INGESTIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { ingestion, work } = await ctx.runQuery(
      internal.v4.ingestion.processors.getIngestionWork,
      args,
    )

    if (work.length === 0) {
      return null
    }

    const pair = await loadPair(ctx, ingestion)

    await Promise.all(
      work.map(async (item) => {
        try {
          await getProcessor(item.processor).process(ctx, pair, item._id)
        } catch (error: unknown) {
          console.error('[v4:processor] failed; work remains pending', {
            work_id: item._id,
            processor: item.processor,
            error,
          })
        }
      }),
    )
    return null
  },
})

export const getIngestionWork = internalQuery({
  args: { ingestion_id: v.id(V4_INGESTIONS_TABLE) },
  returns: v.object({
    ingestion: ingestionsTable.validator,
    work: v.array(docValidator(V4_PROCESSOR_WORK_TABLE, processorWorkTable)),
  }),
  handler: async (ctx, args) => {
    const ingestion = await ctx.db.get(V4_INGESTIONS_TABLE, args.ingestion_id)

    if (ingestion === null) {
      throw new ConvexError('Ingestion has not been released')
    }

    const work = []
    for (const processor of activeProcessors) {
      const item = await findWork(ctx, ingestion._id, processor)

      if (item?.state === 'pending') {
        work.push(item)
      }
    }
    return { ingestion: { from_scan_at: ingestion.from_scan_at, scan_at: ingestion.scan_at }, work }
  },
})

/** Manual recovery: request one attempt for one outstanding obligation. Never loops/retries. */
export const retryWork = internalMutation({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const work = await ctx.db.get(V4_PROCESSOR_WORK_TABLE, args.work_id)

    if (work === null) {
      throw new ConvexError('Processor work does not exist')
    }

    getProcessor(work.processor)

    if (work.state === 'pending') {
      await ctx.scheduler.runAfter(0, internal.v4.ingestion.processors.processWork, args)
    }

    return null
  },
})

export const getWorkInput = internalQuery({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE) },
  returns: v.union(
    v.null(),
    v.object({
      work: docValidator(V4_PROCESSOR_WORK_TABLE, processorWorkTable),
      ingestion: ingestionsTable.validator,
    }),
  ),
  handler: async (ctx, args) => {
    const work = await ctx.db.get(V4_PROCESSOR_WORK_TABLE, args.work_id)

    if (work === null) {
      throw new ConvexError('Processor work does not exist')
    }

    if (work.state === 'complete') {
      return null
    }

    const ingestion = await ctx.db.get(V4_INGESTIONS_TABLE, work.ingestion_id)

    if (ingestion === null) {
      throw new ConvexError('Ingestion has not been released')
    }

    return { work, ingestion: { from_scan_at: ingestion.from_scan_at, scan_at: ingestion.scan_at } }
  },
})

/** Single scheduled attempt. Payload mutation owns duplicate protection, not this read. */
export const processWork = internalAction({
  args: { work_id: v.id(V4_PROCESSOR_WORK_TABLE) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(internal.v4.ingestion.processors.getWorkInput, args)

    if (input !== null) {
      const pair = await loadPair(ctx, input.ingestion)
      await getProcessor(input.work.processor).process(ctx, pair, input.work._id)
    }

    return null
  },
})
