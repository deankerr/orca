import { ConvexError, v } from 'convex/values'
import { chunk } from 'remeda'

import { internal } from '../_generated/api'
import { env, internalAction, internalMutation } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import * as endpoints from './catalog/endpoints'
import * as models from './catalog/models'
import { projectEndpoint, projectEndpoints, projectModel, projectProvider } from './catalog/project'
import * as providers from './catalog/providers'
import { currentEndpointsTable, currentModelsTable, currentProvidersTable } from './catalog/table'
import * as listings from './history/listings'
import * as pricing from './history/pricing'
import { catalogScanAt, findCursor } from './ingestion/clock'
import * as state from './ingestion/state'
import { ingestionsTable } from './ingestion/table'
import { loadEntities, loadPair, nextPair } from './scan'
import type { LoadedScanPair } from './scan'
import * as stats from './stats/current'

const histories = { pricing, listings }

/**
 * One-time production bootstrap; delete this file after completion.
 * Overrides routine guarantees: declared pairs track replay progress while Catalog is
 * incomplete until the final sweep. Keep V4 serving and all other ingestion loops off.
 * History resumes via cursors; finalization deliberately restarts its sweep on failure.
 */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    assertOffline()
    await ctx.runMutation(internal.v4.backfill.prepare, {})
    // Finish any history writes left behind by an interrupted action before advancing.
    await catchUpHistory(ctx)
    const clock = await ctx.runQuery(internal.v4.ingestion.progress.getCatalogScanAt, {})
    const pair = await nextPair(ctx, clock)

    if (pair === null) {
      if (clock === null) {
        throw new ConvexError('Backfill needs two scan artifacts')
      }

      // Non-routine and deliberately non-resumable: no saved sweep/batch position.
      // A failure leaves partial table writes; rerun every batch from the beginning.
      // Identity-based replacement makes the sweep repeatable, not atomic.
      const scan = await loadEntities(ctx, clock)

      console.log('[v4:backfill] sweep prepared', {
        scan_at: clock,
        models: scan.models.size,
        providers: scan.providers.size,
        endpoints: scan.endpoints.size,
      })

      const modelRows = new Map(
        [...scan.models].map(([id, model]) => [id, projectModel(model, clock)]),
      )
      // A full endpoint table timed out in rehearsal; cap each sweep mutation's identity reads/writes.
      for (const rows of chunk([...modelRows.values()], 200)) {
        await ctx.runMutation(internal.v4.backfill.sweep, {
          update: { scan_at: clock, table: 'models', rows },
        })
      }
      const providerRows = [...scan.providers.values()].map((provider) =>
        projectProvider(provider, clock),
      )
      for (const rows of chunk(providerRows, 200)) {
        await ctx.runMutation(internal.v4.backfill.sweep, {
          update: { scan_at: clock, table: 'providers', rows },
        })
      }
      for (const rows of chunk([...projectEndpoints(scan, modelRows).values()], 200)) {
        await ctx.runMutation(internal.v4.backfill.sweep, {
          update: { scan_at: clock, table: 'endpoints', rows },
        })
      }
      const cursors = await ctx.runQuery(internal.v4.ingestion.progress.listModuleCursors, {})
      const cursor = cursors.find((row) => row.module === 'current_stats')?.scan_at ?? null

      if (cursor !== clock) {
        await stats.process(
          ctx,
          { previous: null, next: scan },
          {
            module: 'current_stats',
            cursor,
            scan_at: clock,
          },
        )
      }

      if ((await nextPair(ctx, clock)) === null) {
        console.log('[v4:backfill] complete; routine ingestion remains disabled', {
          scan_at: clock,
        })
      } else {
        await ctx.scheduler.runAfter(0, internal.v4.backfill.run, {})
      }

      return null
    }

    const loaded = await loadPair(ctx, pair)
    const rows = departures(loaded)

    console.log('[v4:backfill] departures prepared', {
      ...pair,
      models: rows.models.length,
      providers: rows.providers.length,
      endpoints: rows.endpoints.length,
    })

    await ctx.runMutation(internal.v4.backfill.advance, {
      ...pair,
      baseline: clock === null,
      ...rows,
    })
    // Shared loaded pair for both history modules, including their initial baseline.
    await catchUpHistory(ctx, loaded)
    await ctx.scheduler.runAfter(0, internal.v4.backfill.run, {})
    return null
  },
})

/** Create only the cursors used by this one-time job; no independent loops are started. */
export const prepare = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    assertOffline()
    console.log('[v4:backfill] prepare cursors', { modules: 3 })
    for (const name of ['pricing', 'listings', 'current_stats'] as const) {
      if ((await findCursor(ctx, name)) === null) {
        await state.createModuleCursor(ctx, name)
      }
    }
    return null
  },
})

/** During bootstrap, declaration tracks replay progress, not a complete current Catalog. */
export const advance = internalMutation({
  args: {
    ...ingestionsTable.validator.fields,
    baseline: v.boolean(),
    models: v.array(currentModelsTable.validator),
    providers: v.array(currentProvidersTable.validator),
    endpoints: v.array(currentEndpointsTable.validator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertOffline()

    console.log('[v4:backfill] departures', {
      scan_at: args.scan_at,
      models: args.models.length,
      providers: args.providers.length,
      endpoints: args.endpoints.length,
    })

    await state.declarePair(
      ctx,
      { from_scan_at: args.from_scan_at, scan_at: args.scan_at },
      { baseline: args.baseline },
    )

    await models.write(ctx, args.models)
    await providers.write(ctx, args.providers)
    await endpoints.write(ctx, args.endpoints)
    return null
  },
})

/** Final sweep writes stay separate by table and bounded to small batches. */
export const sweep = internalMutation({
  args: {
    update: v.union(
      v.object({
        scan_at: v.string(),
        table: v.literal('models'),
        rows: v.array(currentModelsTable.validator),
      }),
      v.object({
        scan_at: v.string(),
        table: v.literal('providers'),
        rows: v.array(currentProvidersTable.validator),
      }),
      v.object({
        scan_at: v.string(),
        table: v.literal('endpoints'),
        rows: v.array(currentEndpointsTable.validator),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { update: args }) => {
    assertOffline()

    console.log('[v4:backfill] sweep', {
      table: args.table,
      rows: args.rows.length,
      scan_at: args.scan_at,
    })

    if ((await catalogScanAt(ctx)) !== args.scan_at) {
      throw new ConvexError('Backfill clock moved during sweep')
    }

    if (args.table === 'models') {
      await models.write(ctx, args.rows)
    } else if (args.table === 'providers') {
      await providers.write(ctx, args.rows)
    } else {
      await endpoints.write(ctx, args.rows)
    }

    return null
  },
})

function departures({ previous, next }: LoadedScanPair) {
  return {
    models: [...previous.models.values()]
      .filter((model) => !next.models.has(model.id))
      .map((model) => projectModel(model, previous.scan_at)),
    providers: [...previous.providers.values()]
      .filter((provider) => !next.providers.has(provider.provider_id))
      .map((provider) => projectProvider(provider, previous.scan_at)),
    endpoints: [...previous.endpoints.values()]
      .filter((endpoint) => !next.endpoints.has(endpoint.id))
      .map((endpoint) => {
        const model = previous.models.get(endpoint.model_id)

        if (model === undefined) {
          throw new ConvexError(`Endpoint ${endpoint.id} is missing model context`)
        }

        return projectEndpoint({
          endpoint,
          model: projectModel(model, previous.scan_at),
          scan_at: previous.scan_at,
          unlisted_at: next.scan_at,
        })
      }),
  }
}

async function catchUpHistory(ctx: ActionCtx, loaded?: LoadedScanPair) {
  for (const name of ['pricing', 'listings'] as const) {
    for (;;) {
      const step = await ctx.runQuery(internal.v4.ingestion.progress.getNextModuleStep, {
        module: name,
        latestOnly: false,
      })

      if (step === null) {
        break
      }

      const { cursor, from_scan_at, scan_at } = step

      const pair =
        from_scan_at === null
          ? {
              previous: null,
              next:
                loaded?.previous.scan_at === scan_at
                  ? loaded.previous
                  : await loadEntities(ctx, scan_at),
            }
          : loaded?.previous.scan_at === from_scan_at && loaded.next.scan_at === scan_at
            ? loaded
            : await loadPair(ctx, { from_scan_at, scan_at })

      await histories[name].process(ctx, pair, { module: name, cursor, scan_at })
    }
  }
}

function assertOffline() {
  if (env.ORCA_V4_INGEST_ENABLED === 'true') {
    throw new ConvexError('Disable routine ingestion before running the one-time backfill')
  }
}
