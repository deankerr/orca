import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { ConvexError } from 'convex/values'

import type { Id } from '#generated/dataModel'
import { env } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import type { EventRow } from '../../events/table'
import { EVENTS_TABLE } from '../../events/table'
import { INGESTIONS_TABLE, PROCESSOR_WORK_TABLE } from '../../ingestion/table'
import { readFrequency } from './frequency'
import { prepareBatch } from './prepare'
import { renderDiscordBatch } from './renderers/index'

/** Stable across JSON object insertion order; arrays intentionally retain display order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)))
    }
    return item
  })
}

export function contentKey(value: unknown): string {
  return bytesToHex(sha256(canonicalJson(value)))
}

/** Preparation and manual sending read the same complete observation. */
export async function renderIngestion(ctx: QueryCtx, ingestionId: Id<typeof INGESTIONS_TABLE>) {
  const ingestion = await ctx.db.get(INGESTIONS_TABLE, ingestionId)

  if (ingestion === null) {
    throw new ConvexError('Ingestion not found')
  }

  const work = await ctx.db
    .query(PROCESSOR_WORK_TABLE)
    .withIndex('by_ingestion_id_and_processor', (q) =>
      q.eq('ingestion_id', ingestionId).eq('processor', 'events'),
    )
    .unique()

  if (work?.state !== 'complete') {
    throw new ConvexError('Ingestion event processing must be complete before preparing alerts')
  }

  // Filtering and batching must not depend on a caller-selected event subset.
  // Keep the original observation time even when previewing historical data.
  const rows = await ctx.db
    .query(EVENTS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', ingestion.scan_at))
    .collect()

  return { scan_at: ingestion.scan_at, ...(await renderRows(ctx, rows)) }
}

export async function renderRows(ctx: QueryCtx, rows: (EventRow & { _id: string })[]) {
  const ordered = rows.toSorted(
    (a, b) =>
      a.scan_at.localeCompare(b.scan_at) ||
      a.entity_kind.localeCompare(b.entity_kind) ||
      a.entity_id.localeCompare(b.entity_id) ||
      a.change_json.localeCompare(b.change_json) ||
      a._id.localeCompare(b._id),
  )
  const { alerts, skippedEvents } = await prepareBatch(
    ordered,
    async (candidates) => await readFrequency(ctx, candidates),
  )
  const notifications = renderDiscordBatch(alerts, {
    publicUrl: env.ORCA_WEB_ORIGIN,
    logoOrigin: env.ORCA_LOGO_ORIGIN,
  })
  const occurrences = new Map<string, number>()
  const messages = notifications.map(({ message, event_ids }) => {
    const hash = contentKey(message)
    const occurrence = (occurrences.get(hash) ?? 0) + 1
    occurrences.set(hash, occurrence)
    return {
      key: occurrence === 1 ? hash : `${hash}:${occurrence}`,
      payload: canonicalJson(message),
      event_ids,
    }
  })
  return { messages, skippedEvents }
}

export async function renderEvents(ctx: QueryCtx, eventIds: Id<'v4_events'>[]) {
  const rows = []
  for (const eventId of new Set(eventIds)) {
    const row = await ctx.db.get('v4_events', eventId)
    if (row === null) {
      throw new ConvexError({ message: 'Event not found.', event_id: eventId })
    }
    rows.push(row)
  }
  return await renderRows(ctx, rows)
}
