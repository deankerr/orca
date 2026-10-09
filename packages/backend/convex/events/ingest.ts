import { v } from 'convex/values'

import { internal } from '#generated/api'
import type { Id } from '#generated/dataModel'
import { internalMutation } from '#generated/server'
import type { ActionCtx, QueryCtx } from '#generated/server'
import type { ScanPair } from '#scan/model'

import { CURRENT_MODELS_TABLE } from '../catalog/models/table'
import { ENDPOINT_LISTINGS_TABLE } from '../history/listings/table'
import { ingestionsTable } from '../ingestion/table'
import { assertWorkOutput, completeWork, pendingWork, workId } from '../ingestion/work'
import type { WorkId } from '../ingestion/work'
import { prepare } from './prepare'
import { eventsTable, EVENTS_TABLE } from './table'
import type { EventRow } from './table'

/** Listings has committed through this event; exclude its own and every later observation. */
async function previouslyKnown(ctx: QueryCtx, row: EventRow): Promise<boolean> {
  const listings = ctx.db.query(ENDPOINT_LISTINGS_TABLE)

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

  if ((await earlier.first()) !== null) {
    return true
  }

  if (row.entity_kind !== 'model') {
    return false
  }

  const model = await ctx.db
    .query(CURRENT_MODELS_TABLE)
    .withIndex('by_model_id', (q) => q.eq('model_id', row.entity_id))
    .unique()

  // ponytail: legacy mutable dates can lose first-observation evidence; backfill from retained scans if needed.
  return model !== null && (model.from_scan_at ?? model.scan_at) < row.scan_at
}

/** Commit this ingestion's events and work completion together, including empty output. */
export const commit = internalMutation({
  args: {
    work_id: workId,
    ...ingestionsTable.validator.fields,
    rows: v.array(eventsTable.validator),
  },
  returns: v.array(v.id(EVENTS_TABLE)),
  handler: async (ctx, args) => {
    const work = await pendingWork(ctx, args.work_id, 'events')

    if (work === null) {
      return []
    }

    assertWorkOutput(work, args, args.rows)

    const eventIds: Id<typeof EVENTS_TABLE>[] = []

    for (const row of args.rows) {
      // Classify this occurrence rather than trusting a caller-supplied flag.
      const { previously_known: _untrusted, ...change } = row

      const eventId = await ctx.db.insert(
        EVENTS_TABLE,
        row.type === 'ADD'
          ? {
              ...change,
              previously_known: await previouslyKnown(ctx, row),
            }
          : change,
      )

      eventIds.push(eventId)
    }

    await completeWork(ctx, args.work_id)
    console.log('[events] commit', { work_id: args.work_id, inserts: args.rows.length })
    return eventIds
  },
})

/** Routine ingestion and recovery use the same supplied observation pair. */
export async function process(
  ctx: ActionCtx,
  pair: ScanPair,
  work_id: WorkId,
): Promise<Id<typeof EVENTS_TABLE>[]> {
  const rows = prepare(pair)

  console.log('[events] prepared', {
    work_id,
    inserts: rows.length,
    argumentLength: JSON.stringify(rows).length,
  })

  return await ctx.runMutation(internal.events.ingest.commit, {
    work_id,
    from_scan_at: pair.previous.scan_at,
    scan_at: pair.next.scan_at,
    rows,
  })
}
