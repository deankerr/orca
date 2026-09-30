import { ConvexError, v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { ActionCtx, QueryCtx } from '../../_generated/server'
import { V4_CURRENT_MODELS_TABLE } from '../catalog/models/table'
import { V4_ENDPOINT_LISTINGS_TABLE } from '../history/listings/table'
import { assertWorkOutput, completeWork, pendingWork, workId } from '../ingestion/work'
import type { WorkId } from '../ingestion/work'
import type { ScanPair } from '../scan/extract'
import { pairTimes } from '../scan/time'
import { prepare } from './prepare'
import { eventsTable, V4_EVENTS_TABLE } from './table'
import type { EventRow } from './table'

/** Capture historical model knowledge before acceptance replaces current Catalog rows. */
export async function knownModels(ctx: QueryCtx, modelIds: string[]): Promise<string[]> {
  const known: string[] = []

  for (const id of modelIds) {
    const model = await ctx.db
      .query(V4_CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', id))
      .unique()

    if (model !== null) {
      known.push(id)
    }
  }

  return known
}

/** Listings has committed through this event; exclude its own and every later observation. */
async function previouslyListed(ctx: QueryCtx, row: EventRow): Promise<boolean> {
  const listings = ctx.db.query(V4_ENDPOINT_LISTINGS_TABLE)

  const earlier =
    row.entity_kind === 'endpoint'
      ? listings.withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', row.entity_id).lt('scan_at', row.scan_at),
        )
      : row.entity_kind === 'provider'
        ? listings.withIndex('by_provider_id_and_scan_at', (q) =>
            q.eq('provider_id', row.entity_id).lt('scan_at', row.scan_at),
          )
        : listings.withIndex('by_model_id_and_scan_at', (q) =>
            q.eq('model_id', row.entity_id).lt('scan_at', row.scan_at),
          )

  return (await earlier.first()) !== null
}

/** Commit this ingestion's events and work completion together, including empty output. */
export const commit = internalMutation({
  args: { work_id: workId, ...pairTimes.fields, rows: v.array(eventsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const work = await pendingWork(ctx, args.work_id, 'events')

    if (work === null) {
      return null
    }

    assertWorkOutput(work, args, args.rows)

    if (work.previously_known_models === undefined) {
      throw new ConvexError('Event work is missing model knowledge captured at acceptance')
    }

    const known = new Set(work.previously_known_models)

    for (const row of args.rows) {
      // Classification belongs to this occurrence, never to the mutable current Catalog.
      const { previously_known: _untrusted, ...change } = row

      await ctx.db.insert(
        V4_EVENTS_TABLE,
        row.type === 'ADD'
          ? {
              ...change,
              previously_known:
                (row.entity_kind === 'model' && known.has(row.entity_id)) ||
                (await previouslyListed(ctx, row)),
            }
          : change,
      )
    }
    await completeWork(ctx, args.work_id)
    console.log('[v4:events] commit', { work_id: args.work_id, inserts: args.rows.length })
    return null
  },
})

/** Routine ingestion and recovery use the same supplied observation pair. */
export async function process(ctx: ActionCtx, pair: ScanPair, work_id: WorkId): Promise<void> {
  const rows = prepare(pair)

  console.log('[v4:events] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })

  await ctx.runMutation(internal.v4.events.ingest.commit, {
    work_id,
    from_scan_at: pair.previous.scan_at,
    scan_at: pair.next.scan_at,
    rows,
  })
}
