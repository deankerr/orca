import * as R from 'remeda'
import { z } from 'zod'

import { versions } from '../catalog/versions'
import { defineMutationSpec } from '../lib/functionSpec'
import { createIngestSummary, ingestArgsValidator } from './shared'

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
      status_page_url: raw.statusPageUrl,
      terms_of_service_url: raw.dataPolicy.termsOfServiceURL,
      privacy_policy_url: raw.dataPolicy.privacyPolicyURL,
      send_client_ip: raw.sendClientIp,
    })

    return { providerRecord }
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
        const { providerRecord } = parseProviderBundle({ item })
        const { id } = providerRecord
        const data = providerRecord

        const currentVersion = await versions.bump.handler(ctx, {
          scopeTable: 'catalog_providers',
          id,
          firstSeenAt: args.firstSeenAt,
          source: args.source,
          data,
        })

        if (!currentVersion) {
          summary.unchanged += 1
          continue
        }

        await ctx.db.insert('catalog_providers', {
          ...data,
          first_seen_at: args.firstSeenAt,
          version_id: currentVersion.versionId,
          version: currentVersion.version,
        })

        summary.changed += 1
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
