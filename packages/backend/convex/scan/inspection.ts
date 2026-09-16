import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { action, query } from '../_generated/server'
import { OBJECTS_LOCATORS_TABLE } from '../objects/table'
import type { ScanComparison, ScanProjection } from '../projections'
import { prepareComparison } from '../projections/documents'
import { INITIAL_SCAN_ARTIFACT_ID, V3_SCAN_INGESTIONS_TABLE } from '../v3/ingestions.table'

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

/** Browse ingestion pairs; availability means a local locator exists, not that bytes were fetched. */
export const ingestions = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      id: v.id(V3_SCAN_INGESTIONS_TABLE),
      fromArtifactId: v.union(v.string(), v.null()),
      toArtifactId: v.string(),
      scanAt: v.string(),
      available: v.object({ from: v.boolean(), to: v.boolean() }),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query(V3_SCAN_INGESTIONS_TABLE)
      .order('desc')
      .paginate(paginationOpts)
    async function available(name: string) {
      if (name === INITIAL_SCAN_ARTIFACT_ID) {
        return true
      }
      return (
        (await ctx.db
          .query(OBJECTS_LOCATORS_TABLE)
          .withIndex('by_path_name', (q) => q.eq('path', 'scans').eq('name', name))
          .unique()) !== null
      )
    }
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (row) => {
          const [from, to] = await Promise.all([
            available(row.from_artifact_id),
            available(row.to_artifact_id),
          ])
          return {
            id: row._id,
            fromArtifactId:
              row.from_artifact_id === INITIAL_SCAN_ARTIFACT_ID ? null : row.from_artifact_id,
            toArtifactId: row.to_artifact_id,
            scanAt: row.scan_at,
            available: { from, to },
          }
        }),
      ),
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
    const { previous, next, document } = await prepareComparison(ctx, fromArtifactId, toArtifactId)
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
