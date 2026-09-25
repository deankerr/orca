import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { query, internalMutation } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import { completeStep, stepArgs } from '../ingestion/step'
import type { Execution, ObservationPair } from '../ingestion/step'
import type { ExtractedScan } from '../scan'
import { changedRows } from './changes'
import { text, strings, metadata } from './fields'
import { projectProvider } from './project'
import { V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './table'

const url = z
  .url({ protocol: /^https?$/ })
  .nullable()
  .catch(null)

/** Commit provider updates and their checkpoint together. */
export const write = internalMutation({
  args: { ...stepArgs, rows: v.array(currentProvidersTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query(V4_CURRENT_PROVIDERS_TABLE)
        .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
        .unique()
      await (existing === null
        ? ctx.db.insert(V4_CURRENT_PROVIDERS_TABLE, row)
        : ctx.db.replace(V4_CURRENT_PROVIDERS_TABLE, existing._id, row))
    }
    return await completeStep(ctx, args)
  },
})

export async function process(
  ctx: ActionCtx,
  pair: ObservationPair,
  execution: Execution,
): Promise<void> {
  const rows = prepare(pair)
  await ctx.runMutation(internal.v4.catalog.providers.write, { ...execution, rows })
}

function prepare(pair: ObservationPair) {
  const project = (scan: ExtractedScan) =>
    new Map(
      [...scan.providers].map(([id, provider]) => [id, projectProvider(provider, scan.scan_at)]),
    )
  return changedRows(pair.previous === null ? null : project(pair.previous), project(pair.next))
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
