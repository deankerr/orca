import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scans'
import type { Scan } from '#scans/extraction'

import { CURRENT_MODELS_TABLE, currentModelsTable } from '../../catalog/tables/current'
import { clock } from '../../products/shared/clock'
import { modelRow } from '../operators/currentModels'

/** Model rows per page; one page bounds each read, restate mutation, and scheduled step. */
const PAGE_SIZE = 100

const retainedRow = v.object({ _id: v.id(CURRENT_MODELS_TABLE), model_id: v.string() })

type RetainedRow = Infer<typeof retainedRow>

const restatement = v.object({ _id: retainedRow.fields._id, row: currentModelsTable.validator })

type Restatement = Infer<typeof restatement>

const pageResult = paginationResultValidator(retainedRow)

const progress = v.object({ absent: v.number(), read: v.number(), restated: v.number() })

export const modelPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db.query(CURRENT_MODELS_TABLE).paginate(paginationOpts)

    return { ...result, page: result.page.map(({ _id, model_id }) => ({ _id, model_id })) }
  },
  returns: pageResult,
})

/** Rows ingested past the refresh scan since the read are newer; skip them. */
export const restate = internalMutation({
  args: { restatements: v.array(restatement) },
  handler: async (ctx, { restatements }) => {
    let restated = 0

    for (const { _id, row } of restatements) {
      const retained = await ctx.db.get(CURRENT_MODELS_TABLE, _id)

      if (retained !== null && retained.scan_at <= row.scan_at) {
        await ctx.db.replace(CURRENT_MODELS_TABLE, _id, row)
        restated += 1
      }
    }

    return restated
  },
  returns: v.number(),
})

/** Model rows as ingestion now derives them; a model no longer served has no facts to restate from. */
function restateFrom(source: Scan, rows: RetainedRow[]) {
  const restatements: Restatement[] = []

  for (const { _id, model_id } of rows) {
    const model = source.models.get(model_id)

    if (model !== undefined) {
      restatements.push({ _id, row: modelRow(model, { scan_at: source.scan_at }) })
    }
  }

  return restatements
}

/** One bounded page of the refresh; schedules the next until every row is read. */
export const refreshPage = internalAction({
  args: { cursor: v.union(v.null(), v.string()), progress, scanAt: v.string() },
  handler: async (ctx, { cursor, progress: before, scanAt }) => {
    const result: Infer<typeof pageResult> = await ctx.runQuery(
      internal.ingestion.catalog.refreshModels.modelPage,
      { paginationOpts: { cursor, numItems: PAGE_SIZE } },
    )

    const restatements = restateFrom(await scans.load(ctx, scanAt), result.page)

    const restated: number = await ctx.runMutation(
      internal.ingestion.catalog.refreshModels.restate,
      { restatements },
    )

    const after = {
      absent: before.absent + result.page.length - restatements.length,
      read: before.read + result.page.length,
      restated: before.restated + restated,
    }

    if (result.isDone) {
      console.log('Refreshed models', after)
    } else {
      await ctx.scheduler.runAfter(0, internal.ingestion.catalog.refreshModels.refreshPage, {
        cursor: result.continueCursor,
        progress: after,
        scanAt,
      })
    }
  },
  returns: v.null(),
})

/**
 * Restate model rows under the current metadata selection, in scheduled pages, from the latest scan
 * with committed output. Ingestion compares both sides of a pair under the current selection, so a
 * selection change alone never rewrites a row.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scanAt = await clock(ctx)

    if (scanAt === null) {
      throw new ConvexError('No committed scan to refresh from')
    }

    await ctx.scheduler.runAfter(0, internal.ingestion.catalog.refreshModels.refreshPage, {
      cursor: null,
      progress: { absent: 0, read: 0, restated: 0 },
      scanAt,
    })
  },
  returns: v.null(),
})
