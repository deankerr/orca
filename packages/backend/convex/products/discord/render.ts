import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { ConvexError } from 'convex/values'
import { isPlainObject } from 'remeda'

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
import { muteNoise } from './mute'
import { prepareBatch } from './prepare'
import { renderDiscordBatch } from './renderers/index'

type Operation = Doc<typeof EVENTS_TABLE>['type']

const operationOrder = { ADD: 0, REMOVE: 2, UPDATE: 1 } satisfies Record<Operation, number>

const entityOrder = {
  ADD: { endpoint: 2, model: 1, provider: 0 },
  REMOVE: { endpoint: 0, model: 1, provider: 2 },
  UPDATE: { endpoint: 2, model: 1, provider: 0 },
} satisfies Record<Operation, Record<AlertSource['entity_kind'], number>>

/** Stable across JSON object insertion order; arrays intentionally retain display order. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Serializes anything JSON.stringify accepts.
export function canonicalJson(value: unknown): string {
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSON.stringify visits arbitrary nested values.
  return JSON.stringify(value, (_key, item: unknown) => {
    if (isPlainObject(item)) {
      return Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b)))
    }

    return item
  })
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Hashes anything canonicalJson accepts.
export function contentKey(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(value))))
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
    return { messages: [], scan_at: record.scan_at, skippedEvents: [] }
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

/** The model a source belongs to; providers belong to none. */
function modelOf(row: AlertSource): string | null {
  if (row.entity_kind === 'provider') {
    return null
  }

  if (row.entity_kind === 'model') {
    return row.entity_id
  }

  return 'change_json' in row ? row.context.model.model_id : row.model_id
}

/** Providers arrive before every model and depart after them. */
function modelGroup(row: AlertSource): number {
  if (modelOf(row) !== null) {
    return 1
  }

  return operation(row) === 'REMOVE' ? 2 : 0
}

/** Variants such as `author/model:batch` sort beside `author/model`, not after `author/model-mini`. */
function compareModels(a: string | null, b: string | null): number {
  if (a === null || b === null) {
    return 0
  }

  const base = (model: string) => model.split(':')[0] ?? model

  return base(a).localeCompare(base(b)) || a.localeCompare(b)
}

export async function renderRows(ctx: QueryCtx, rows: AlertSource[], mute = muteNoise) {
  // Group each model with its endpoints. Within a group, introduce parents before endpoints and
  // announce endpoint unlistings before parent departures.
  // Sort before batching so grouped unlistings retain the same lifecycle order.
  const ordered = rows.toSorted(
    (a, b) =>
      a.scan_at.localeCompare(b.scan_at) ||
      modelGroup(a) - modelGroup(b) ||
      compareModels(modelOf(a), modelOf(b)) ||
      operationOrder[operation(a)] - operationOrder[operation(b)] ||
      entityOrder[operation(a)][a.entity_kind] - entityOrder[operation(b)][b.entity_kind] ||
      a.entity_id.localeCompare(b.entity_id) ||
      a._id.localeCompare(b._id),
  )

  const interpreted = await Promise.all(
    ordered.map(async (row) => ({
      event: selectDefault(await interpret(ctx, row)),
      source_id: row._id,
    })),
  )

  // TEMPORARY: see `muteNoise`. Muting precedes frequency and batching, which still run unchanged.
  const { rows: audible, muted } = mute(interpreted)

  const prepared = await prepareBatch(
    audible,
    async (candidates) => await readFrequency(ctx, candidates),
  )

  const skippedEvents = [
    ...muted.map((source_id) => ({ reason: 'muted' as const, source_id })),
    ...prepared.skippedEvents,
  ]

  const notifications = renderDiscordBatch(prepared.alerts, {
    logoOrigin: env.ORCA_LOGO_ORIGIN,
    publicUrl: env.ORCA_WEB_ORIGIN,
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
