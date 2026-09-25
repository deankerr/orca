import { v, ConvexError } from 'convex/values'
import type { Infer } from 'convex/values'

import type { MutationCtx } from '../../_generated/server'
import type { ExtractedScan, ScanPair } from '../scan'
import { findCursor } from './clock'
import { V4_CURSORS_TABLE, moduleName } from './table'

const moduleStep = v.object({
  module: moduleName,
  cursor: v.union(v.null(), v.string()),
  scan_at: v.string(),
})

export const stepArgs = moduleStep.fields

/** The cursor a module's write expects, and the scan time it advances to. */
export type ModuleStep = Infer<typeof moduleStep>

/** A null previous scan is a module baseline, or unused by latest-only modules. */
export type ObservationPair = { previous: ExtractedScan | null; next: ExtractedScan }

/** Log intended work before touching `ctx.db`, so a hit mutation limit can be explained. */
export function logStep({ module, cursor, scan_at }: ModuleStep, counts: Record<string, number>) {
  console.log(`[v4:${module}] write`, { cursor, scan_at, ...counts })
}

/** Commit progress with data; a moved cursor rolls the write back, so no pair applies twice. */
export async function advanceModuleCursor(
  ctx: MutationCtx,
  { module, cursor, scan_at }: ModuleStep,
): Promise<null> {
  const row = await findCursor(ctx, module)

  if (row === null || row.scan_at !== cursor) {
    throw new ConvexError({
      message: 'Module cursor moved',
      module,
      expected: cursor,
      actual: row?.scan_at,
    })
  }

  await ctx.db.patch(V4_CURSORS_TABLE, row._id, { scan_at })
  return null
}

type CatalogArgs = ScanPair & { models: unknown[]; providers: unknown[]; endpoints: unknown[] }

/** Callers also log argument size, since a timed-out mutation loses its own logs. */
export function logCatalog(step: string, args: CatalogArgs, argumentLength?: number) {
  console.log(`[v4:catalog] ${step}`, {
    from_scan_at: args.from_scan_at,
    scan_at: args.scan_at,
    models: args.models.length,
    providers: args.providers.length,
    endpoints: args.endpoints.length,
    ...(argumentLength === undefined ? {} : { argumentLength }),
  })
}
