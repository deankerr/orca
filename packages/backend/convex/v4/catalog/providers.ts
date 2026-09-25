import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '../../_generated/server'
import type { MutationCtx } from '../../_generated/server'
import type { ExtractedScan, LoadedScanPair } from '../scan'
import { changedRows } from './changes'
import { text, strings, metadata } from './fields'
import { projectProvider } from './project'
import { V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './table'
import type { CurrentProviderRow } from './table'

const url = z
  .url({ protocol: /^https?$/ })
  .nullable()
  .catch(null)

/** Insert or replace provider rows within the Catalog's mutation. */
export async function write(ctx: MutationCtx, rows: CurrentProviderRow[]): Promise<void> {
  for (const row of rows) {
    const existing = await ctx.db
      .query(V4_CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
      .unique()

    await (existing === null
      ? ctx.db.insert(V4_CURRENT_PROVIDERS_TABLE, row)
      : ctx.db.replace(V4_CURRENT_PROVIDERS_TABLE, existing._id, row))
  }
}

export function prepare(pair: LoadedScanPair) {
  const project = (scan: ExtractedScan) =>
    new Map(
      [...scan.providers].map(([id, provider]) => [id, projectProvider(provider, scan.scan_at)]),
    )
  return changedRows(project(pair.previous), project(pair.next))
}

/** Interpret provider-owned overview facts. */
export const Provider = convexToZod(docValidator(V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable))
  .extend({
    metadata_json: metadata.pipe(
      z.object({
        headquarters: text,
        datacenters: strings,
        statusPageUrl: url,
        dataPolicy: z
          .object({ termsOfServiceURL: url, privacyPolicyURL: url })
          .nullable()
          .catch(null),
      }),
    ),
  })
  .transform(({ metadata_json: facts, ...identity }) => ({
    ...identity,
    headquarters: facts.headquarters,
    datacenters: facts.datacenters,
    statusPageUrl: facts.statusPageUrl,
    'dataPolicy.termsOfServiceURL': facts.dataPolicy?.termsOfServiceURL ?? null,
    'dataPolicy.privacyPolicyURL': facts.dataPolicy?.privacyPolicyURL ?? null,
  }))

/** Current or last-known provider. */
export const get = query({
  args: { provider_id: v.string() },
  returns: v.union(v.null(), zodOutputToConvex(Provider)),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(V4_CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', args.provider_id))
      .unique()
    return row === null ? null : Provider.parse(row)
  },
})
