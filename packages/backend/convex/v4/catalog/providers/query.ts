import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '../../../_generated/server'
import { text, strings, metadata } from '../fields'
import { V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable } from './table'

const url = z
  .url({ protocol: /^https?$/ })
  .nullable()
  .catch(null)

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
