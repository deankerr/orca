import { ConvexError, v } from 'convex/values'

import { internal } from '../../_generated/api'
import type { Id } from '../../_generated/dataModel'
import type { ActionCtx, MutationCtx } from '../../_generated/server'
import type { PreparedRows } from '../projections/compare'
import { COMPLETE_PHASE, isBaselinePhase, nextPhase, phaseOutput } from './phases'
import type { Output } from './phases'
import { V4_INGESTIONS_TABLE } from './table'

export const stepArgs = {
  ingestionId: v.id(V4_INGESTIONS_TABLE),
  expectedPhase: v.string(),
}

/** Store one prepared observation from its phase, including cumulative current-entity updates. */
export async function consume(
  ctx: ActionCtx,
  ingestion: { id: Id<typeof V4_INGESTIONS_TABLE>; phase: string },
  rows: PreparedRows,
): Promise<string> {
  let { phase } = ingestion
  const baseline = isBaselinePhase(phase)

  while (phase !== COMPLETE_PHASE && isBaselinePhase(phase) === baseline) {
    const args = { ingestionId: ingestion.id, expectedPhase: phase }
    switch (phaseOutput(phase)) {
      case 'records': {
        phase = await ctx.runMutation(internal.v4.records.write.writeRecords, {
          ...args,
          rows: rows.records,
        })
        break
      }
      case 'readings': {
        phase = await ctx.runMutation(internal.v4.series.readings.writeReadings, {
          ...args,
          rows: rows.readings,
        })
        break
      }
      case 'prices': {
        phase = await ctx.runMutation(internal.v4.series.prices.writePrices, {
          ...args,
          rows: rows.prices,
        })
        break
      }
      case 'listings': {
        phase = await ctx.runMutation(internal.v4.series.listings.writeListings, {
          ...args,
          rows: rows.listings,
        })
        break
      }
      case 'models': {
        phase = await ctx.runMutation(internal.v4.catalog.write.models, {
          ...args,
          rows: rows.models,
        })
        break
      }
      case 'providers': {
        phase = await ctx.runMutation(internal.v4.catalog.write.providers, {
          ...args,
          rows: rows.providers,
        })
        break
      }
      case 'endpoints': {
        phase = await ctx.runMutation(internal.v4.catalog.write.endpoints, {
          ...args,
          rows: rows.endpoints,
        })
        break
      }
      default: {
        throw new ConvexError(`Unknown ingestion writer for ${phase}`)
      }
    }
  }

  return phase
}

/** Commit the phase's writes and advancement together. */
export async function finishStep<T extends { scan_at: string }>(
  ctx: MutationCtx,
  args: {
    ingestionId: Id<typeof V4_INGESTIONS_TABLE>
    expectedPhase: string
    output: Output
  },
  rows: readonly T[],
  write: (ctx: MutationCtx, rows: readonly T[]) => Promise<void>,
): Promise<string> {
  if (phaseOutput(args.expectedPhase) !== args.output) {
    throw new ConvexError(`The ${args.output} writer cannot execute ${args.expectedPhase}`)
  }

  const ingestion = await ctx.db.get(V4_INGESTIONS_TABLE, args.ingestionId)

  if (ingestion === null) {
    throw new ConvexError('V4 ingestion is missing')
  }

  if (ingestion.phase !== args.expectedPhase) {
    throw new ConvexError(
      `V4 ingestion phase is ${ingestion.phase}, expected ${args.expectedPhase}`,
    )
  }

  const scanAt = isBaselinePhase(args.expectedPhase) ? ingestion.from_scan_at : ingestion.scan_at

  for (const row of rows) {
    if (row.scan_at !== scanAt) {
      throw new ConvexError(`Row time ${row.scan_at} does not match ingestion step ${scanAt}`)
    }
  }

  await write(ctx, rows)
  const following = nextPhase(args.expectedPhase)
  await ctx.db.patch(V4_INGESTIONS_TABLE, args.ingestionId, { phase: following })
  return following
}
