import { v } from 'convex/values'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from '../../catalog/tables/current'
import type { CurrentProviderRow } from '../../catalog/tables/current'
import { commitProcess, commitResult, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { providerEntity } from '../lenses'

const omittedMetadataKeys = [
  'slug',
  'adapterName',
  'baseUrl',
  'pricingStrategy',
  'regionOverrides',
  'hasChatCompletions',
  'hasCompletions',
  'isAbortable',
  'isMultipartSupported',
  'isPrivate',
  'moderationRequired',
  'requiredAttestationTypes',
  'editors',
  'owners',
  'ignoredProviderModels',
  'icon',
] as const

export const ingest: Ingestor = createIngestor({
  process: 'currentProviders',
  prepare(_ctx, { previous, next, has_later_scan }) {
    const providers = has_later_scan ? [] : [...next.providers.values()]

    for (const [id, provider] of previous.providers) {
      if (!next.providers.has(id)) {
        providers.push(provider)
      }
    }

    const rows = providers.map((provider) => {
      const { metadata, ...fields } = providerEntity(provider)
      const row: CurrentProviderRow = {
        ...fields,
        scan_at: next.scan_at,
        metadata_json: JSON.stringify(R.omit(metadata, omittedMetadataKeys)),
      }

      return row
    })

    return { scan_at: next.scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentProviders.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    rows: v.array(currentProvidersTable.validator),
  },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_PROVIDERS_TABLE)
          .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
          .unique()

        if (existing !== null && row.scan_at <= existing.scan_at) {
          continue
        }

        await (existing === null
          ? ctx.db.insert(CURRENT_PROVIDERS_TABLE, row)
          : ctx.db.replace(CURRENT_PROVIDERS_TABLE, existing._id, row))
      }
    }),
})
