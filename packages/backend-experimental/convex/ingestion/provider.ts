import * as R from 'remeda'
import { z } from 'zod'

import { registry } from '../catalog/registry'
import { defineMutationSpec } from '../lib/functionSpec'
import { createIngestSummary, ingestArgsValidator, ingestSummaryValidator } from './shared'

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
    const provider_base = compact({
      slug: raw.slug,
      name: raw.displayName,
      headquarters: raw.headquarters,
      datacenters: raw.datacenters,
      status_page_url: raw.statusPageUrl,
      terms_of_service_url: raw.dataPolicy.termsOfServiceURL,
      privacy_policy_url: raw.dataPolicy.privacyPolicyURL,
      send_client_ip: raw.sendClientIp,
    })

    return { provider_base }
  })

export function parseProviderBundle(args: { item: Record<string, unknown> }) {
  return rawProviderSchema.parse(args.item)
}

export const ingestProviders = defineMutationSpec({
  args: ingestArgsValidator,
  returns: ingestSummaryValidator,
  handler: async (ctx, args) => {
    const summary = createIngestSummary()

    for (const item of args.items) {
      summary.processed += 1

      try {
        const { provider_base } = parseProviderBundle({ item })
        const entityKey = provider_base.slug
        const data = provider_base

        const state = await registry.bump.handler(ctx, {
          entityKind: 'provider',
          entityAspect: 'base',
          entityKey,
          sinceAt: args.sinceAt,
          source: args.source,
          data,
        })

        if (!state) {
          summary.unchanged += 1
          continue
        }

        await ctx.db.insert('catalog_providers_base', {
          ...data,
          since_at: args.sinceAt,
          state_id: state.stateId,
          sequence: state.sequence,
        })

        summary.changed += 1
      } catch (error) {
        summary.failed += 1
        console.log('[ingestion:provider] failed to parse or store item', {
          sinceAt: args.sinceAt,
          source: args.source,
          item,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return summary
  },
})
