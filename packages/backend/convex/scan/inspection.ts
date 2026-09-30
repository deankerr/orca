import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { action, query } from '../_generated/server'
import { loadMany } from '../objects'
import { compareScanProjections, ScanProjection } from '../projections'
import type { ScanComparison } from '../projections'
import { V4_INGESTIONS_TABLE } from '../v4/ingestion/table'
import { artifactName, parseScanArtifact } from './artifact'

type Collection = keyof ScanProjection['catalog']
type OwnerRecord = ScanProjection['catalog'][Collection][string]

/** Parsed JSON returned by compare; text transport preserves document key order. */
export type InspectionResult = {
  document: ScanComparison['document']
  owner: {
    collection: Collection
    id: string
    before: OwnerRecord | null
    after: OwnerRecord | null
  } | null
}

/** Browse accepted V4 pairs in observation order; source availability is checked when comparing. */
export const ingestions = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id(V4_INGESTIONS_TABLE),
      fromArtifactId: v.string(),
      toArtifactId: v.string(),
      scanAt: v.string(),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_scan_at')
      .order('desc')
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map((row) => ({
        id: row._id,
        fromArtifactId: artifactName(row.from_scan_at),
        toArtifactId: artifactName(row.scan_at),
        scanAt: row.scan_at,
      })),
    }
  },
})

/** Compute a net comparison of any two artifacts, optionally including one owner's full context. */
export const compare = action({
  args: {
    fromArtifactId: v.union(v.string(), v.null()),
    toArtifactId: v.string(),
    owner: v.optional(
      v.object({
        collection: v.union(v.literal('models'), v.literal('providers'), v.literal('endpoints')),
        id: v.string(),
      }),
    ),
  },
  // Convex sorts object keys in transit; JSON text preserves the comparison's authored order.
  returns: v.string(),
  handler: async (ctx, { fromArtifactId, toArtifactId, owner }) => {
    const names = [toArtifactId, ...(fromArtifactId === null ? [] : [fromArtifactId])]
    const [nextText, previousText] = await loadMany(
      ctx,
      names.map((name) => ({ path: 'scans', name })),
    )
    const next = project(toArtifactId, nextText)
    const previous =
      fromArtifactId === null
        ? ScanProjection.parse({ id: 'initial', scan_at: '', entries: [] })
        : project(fromArtifactId, previousText)
    const { document } = compareScanProjections(previous, next)
    if (owner === undefined) {
      return JSON.stringify({ document, owner: null } satisfies InspectionResult)
    }

    const changes = document.changes
      .filter((group) => group.key === owner.collection)
      .map((group) => ({
        ...group,
        changes: group.changes?.filter((change) => change.key === owner.id),
      }))
      .filter((group) => (group.changes?.length ?? 0) > 0)
    const before = previous.catalog[owner.collection]
    const after = next.catalog[owner.collection]
    return JSON.stringify({
      document: { ...document, changes },
      owner: {
        ...owner,
        before: Object.hasOwn(before, owner.id) ? before[owner.id] : null,
        after: Object.hasOwn(after, owner.id) ? after[owner.id] : null,
      },
    } satisfies InspectionResult)
  },
})

function project(id: string, text: string | null | undefined): ScanProjection {
  if (text === null || text === undefined) {
    throw new ConvexError(`Scan artifact not found: ${id}`)
  }
  return ScanProjection.parse(parseScanArtifact(id, text))
}
