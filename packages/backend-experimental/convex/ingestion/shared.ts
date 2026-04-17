import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { catalogSourceValidator } from '../catalog/shared'
import type { CatalogScopeTable } from '../catalog/shared'
import { versions } from '../catalog/versions'

export const ingestArgsValidator = {
  items: v.array(v.record(v.string(), v.any())),
  firstSeenAt: v.number(),
  source: catalogSourceValidator,
}

export type IngestArgs = {
  items: Record<string, unknown>[]
  firstSeenAt: number
  source: {
    locator: string
    storageId?: string
  }
}

export function createIngestSummary() {
  return {
    processed: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
  }
}

export type IngestSummary = ReturnType<typeof createIngestSummary>

/**
 * Checks if content has changed and creates a new version if so.
 * Returns the data merged with version metadata if a new version was created, null if unchanged.
 */
export async function bumpVersion<T extends Record<string, unknown>>(
  ctx: MutationCtx,
  args: {
    table: CatalogScopeTable
    id: string
    data: T
    firstSeenAt: number
    source: {
      locator: string
      storageId?: string
    }
  },
): Promise<
  (T & { versionId: Id<'catalog_versions'>; version: number; firstSeenAt: number }) | null
> {
  const result = await versions.bump.handler(ctx, {
    scopeTable: args.table,
    id: args.id,
    firstSeenAt: args.firstSeenAt,
    source: args.source,
    data: args.data,
  })

  if (!result) {
    return null
  }

  return {
    ...args.data,
    versionId: result.versionId,
    version: result.version,
    firstSeenAt: args.firstSeenAt,
  }
}
