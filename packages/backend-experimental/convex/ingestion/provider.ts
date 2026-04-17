import * as R from 'remeda'
import { z } from 'zod'

import { defineMutationSpec } from '../lib/functionSpec'
import { bumpVersion, createIngestSummary, ingestArgsValidator } from './shared'

function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

const rawProviderSchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    headquarters: z.string().optional(),
    datacenters: z
      .string()
      .array()
      .transform((value) => value.toSorted())
      .optional(),
    statusPageUrl: z.url().nullable(),
    dataPolicy: z.object({
      termsOfServiceURL: z.string().optional(),
      privacyPolicyURL: z.string().optional(),
    }),
    sendClientIp: z.boolean(),
  })
  .transform((raw) => {
    const providerRecord = compact({
      id: raw.slug,
      name: raw.displayName,
      headquarters: raw.headquarters,
      datacenters: raw.datacenters,
      statusPageUrl: raw.statusPageUrl,
      termsOfServiceUrl: raw.dataPolicy.termsOfServiceURL,
      privacyPolicyUrl: raw.dataPolicy.privacyPolicyURL,
      sendClientIp: raw.sendClientIp,
    })

    return {
      id: providerRecord.id,
      providerRecord,
    }
  })

export function parseProviderBundle(args: { item: Record<string, unknown> }) {
  return rawProviderSchema.parse(args.item)
}

export const ingestProviders = defineMutationSpec({
  args: ingestArgsValidator,
  handler: async (ctx, args) => {
    const summary = createIngestSummary()

    for (const item of args.items) {
      summary.processed += 1

      try {
        const { id, providerRecord } = parseProviderBundle({ item })

        const providerWithVersion = await bumpVersion(ctx, {
          table: 'catalog_providers',
          id,
          data: providerRecord,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
        })

        if (providerWithVersion) {
          await ctx.db.insert('catalog_providers', providerWithVersion)
          summary.changed += 1
        } else {
          summary.unchanged += 1
        }
      } catch (error) {
        summary.failed += 1
        console.log('[ingestion:provider] failed to parse or store item', {
          firstSeenAt: args.firstSeenAt,
          source: args.source,
          item,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return summary
  },
})
