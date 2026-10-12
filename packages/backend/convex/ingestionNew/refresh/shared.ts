import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import type { QueryCtx } from '#generated/server'

import { compare } from '../../compare'
import type { JsonValue } from '../../json'
import { INGESTIONS_TABLE } from '../table'

export const source = v.object({
  scan_at: v.string(),
  basis: v.union(v.literal('latest'), v.literal('departure')),
})

export const result = v.object({
  source_scan_at: v.string(),
  source_basis: source.fields.basis,
  changed: v.boolean(),
})

export type RefreshResult = Infer<typeof result>

export async function completedCutoff(
  ctx: QueryCtx,
  row: { scan_at: string; unlisted_at?: string },
) {
  const complete = await ctx.db
    .query(INGESTIONS_TABLE)
    .withIndex('by_progress_kind_and_scan_at', (q) => q.eq('progress.kind', 'complete'))
    .order('desc')
    .first()

  if (complete === null) {
    throw new ConvexError('Current view refresh requires a completed input')
  }

  if (row.scan_at > complete.scan_at || (row.unlisted_at ?? '') > complete.scan_at) {
    throw new ConvexError('Entity has pending ingestion changes; retry after input completion')
  }

  return complete.scan_at
}

/** Sparse presence observations locate a capture; their own date is not a last-seen date. */
export async function locateSource(
  ctx: QueryCtx,
  observedAt: string,
  present: boolean,
  cutoff: string,
) {
  if (present) {
    return { scan_at: cutoff, basis: 'latest' as const }
  }

  const departure = await ctx.db
    .query(INGESTIONS_TABLE)
    .withIndex('by_scan_at', (q) => q.eq('scan_at', observedAt))
    .unique()

  if (departure?.progress.kind !== 'complete' || departure.from_scan_at === null) {
    throw new ConvexError(
      'Departure observation requires a completed input with a preceding capture',
    )
  }

  return { scan_at: departure.from_scan_at, basis: 'departure' as const }
}

export function assertReplacement(
  row: { _id: string; scan_at: string } | null,
  before: { _id: string; scan_at: string },
  after: { _id: string; scan_at: string },
  cutoff: string,
) {
  if (row === null || compare(row, before).length > 0) {
    throw new ConvexError('Entity changed during current view refresh; retry the entity')
  }

  if (after._id !== row._id || after.scan_at < row.scan_at || after.scan_at > cutoff) {
    throw new ConvexError('Replacement is outside the refresh observation range or identity')
  }
}

export function currentFacts<T extends { scan_at: string; metadata_json: string }>(row: T) {
  const { scan_at: _scanAt, metadata_json, ...fields } = row
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Current projections encode trusted JSON before storage.
  const metadata = JSON.parse(metadata_json) as JsonValue
  return { ...fields, metadata }
}
