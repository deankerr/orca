import { convexToZod, zodOutputToConvex } from 'convex-helpers/server/zod4'
import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { z } from 'zod'

import { query } from '#generated/server'

import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from '../../catalog/tables/current'
import { textOrNull, stringsOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'

const url = z
  .url({ protocol: /^https?$/u })
  .nullable()
  .catch(null)

/** Interpret provider-owned overview facts. */
const Provider = convexToZod(docValidator(CURRENT_PROVIDERS_TABLE, currentProvidersTable))
  .extend({
    metadata_json: JsonObjectFromString.pipe(
      z.object({
        dataPolicy: z
          .object({ privacyPolicyURL: url, termsOfServiceURL: url })
          .nullable()
          .catch(null),
        datacenters: stringsOrNull,
        headquarters: textOrNull,
        statusPageUrl: url,
      }),
    ),
  })
  .transform(({ metadata_json: facts, ...identity }) => ({
    ...identity,
    'dataPolicy.privacyPolicyURL': facts.dataPolicy?.privacyPolicyURL ?? null,
    'dataPolicy.termsOfServiceURL': facts.dataPolicy?.termsOfServiceURL ?? null,
    datacenters: facts.datacenters,
    headquarters: facts.headquarters,
    statusPageUrl: facts.statusPageUrl,
  }))

/** Current or last-known provider. */
export const get = query({
  args: { provider_id: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query(CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', args.provider_id))
      .unique()

    return row === null ? null : Provider.parse(row)
  },
  returns: v.union(v.null(), zodOutputToConvex(Provider)),
})
