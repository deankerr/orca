import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex } from '@noble/hashes/utils'
import { ConvexError } from 'convex/values'

import type { Doc, Id } from '#generated/dataModel'
import { env } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { EVENTS_TABLE } from '../../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../../catalog/tables/observations'
import { INGESTION_RECORDS_TABLE } from '../../ingestion/tables'
import { interpret } from '../shared/alerts/interpret'
import { selectDefault } from '../shared/alerts/prepare'
import type { AlertSource } from '../shared/alerts/read'
import { readFrequency } from './frequency'
import { prepareBatch } from './prepare'
import { renderDiscordBatch } from './renderers/index'

type Operation = Doc<typeof EVENTS_TABLE>['type']

const operationOrder = { ADD: 0, UPDATE: 1, REMOVE: 2 } satisfies Record<Operation, number>
const entityOrder = {
  ADD: { provider: 0, model: 1, endpoint: 2 },
  UPDATE: { provider: 0, model: 1, endpoint: 2 },
  REMOVE: { endpoint: 0, model: 1, provider: 2 },
} satisfies Record<Operation, Record<AlertSource['entity_kind'], number>>

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
export async function renderRecord(ctx: QueryCtx, recordId: Id<typeof INGESTION_RECORDS_TABLE>) {
  const record = await ctx.db.get(INGESTION_RECORDS_TABLE, recordId)

  if (record === null) {
    throw new ConvexError('Ingestion record not found')
  }

  if (record.state !== 'complete') {
    throw new ConvexError('Ingestion record must be complete before preparing alerts')
  }

  if (record.kind === 'baseline') {
    return { scan_at: record.scan_at, messages: [], skippedEvents: [] }
  }

  // Filtering and batching must not depend on a caller-selected event subset.
  // Keep the original observation time even when previewing historical data.
  const rows = await ctx.db
    .query(EVENTS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', record.scan_at))
    .collect()

  const observations = await ctx.db
    .query(OBSERVATIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', record.scan_at))
    .collect()
  return { scan_at: record.scan_at, ...(await renderRows(ctx, [...rows, ...observations])) }
}

/** Observations carry lifecycle as presence: listed or serving rows arrive, others depart. */
function operation(row: AlertSource): Operation {
  if ('change_json' in row) {
    return row.type
  }

  const present = row.entity_kind === 'endpoint' ? row.detected : row.endpoint_count > 0
  return present ? 'ADD' : 'REMOVE'
}

export async function renderRows(ctx: QueryCtx, rows: AlertSource[]) {
  // Introduce parents before endpoints; announce endpoint unlistings before parent departures.
  // Sort before batching so grouped unlistings retain the same lifecycle order.
  const ordered = rows.toSorted(
    (a, b) =>
      a.scan_at.localeCompare(b.scan_at) ||
      operationOrder[operation(a)] - operationOrder[operation(b)] ||
      entityOrder[operation(a)][a.entity_kind] - entityOrder[operation(b)][b.entity_kind] ||
      a.entity_id.localeCompare(b.entity_id) ||
      a._id.localeCompare(b._id),
  )
  const { alerts, skippedEvents } = await prepareBatch(
    await Promise.all(
      ordered.map(async (row) => ({
        source_id: row._id,
        event: selectDefault(await interpret(ctx, row)),
      })),
    ),
    async (candidates) => await readFrequency(ctx, candidates),
  )
  const notifications = renderDiscordBatch(alerts, {
    publicUrl: env.ORCA_WEB_ORIGIN,
    logoOrigin: env.ORCA_LOGO_ORIGIN,
  })
  const occurrences = new Map<string, number>()
  const messages = notifications.map(({ message, source_ids }) => {
    const hash = contentKey(message)
    const occurrence = (occurrences.get(hash) ?? 0) + 1
    occurrences.set(hash, occurrence)
    return {
      key: occurrence === 1 ? hash : `${hash}:${occurrence}`,
      payload: canonicalJson(message),
      source_ids,
    }
  })
  return { messages, skippedEvents }
}
