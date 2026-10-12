import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ScannedProvider, ScanPair } from '#scanNew/model'

import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from '../catalogNew/tables/current'
import type { CurrentProviderRow } from '../catalogNew/tables/current'
import { compare } from '../compare'
import { providerEntity } from './lenses'
import { commitStage } from './progress'
import type { InputId } from './table'
import { ingestionId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { previous, next }: ScanPair,
  ingestion_id: InputId,
): Promise<void> {
  const rows: Omit<CurrentProviderRow, 'first_scan_at'>[] = []

  for (const [id, provider] of next.providers) {
    const previousProvider = previous.providers.get(id)
    const after = currentProvider(provider)

    if (
      previousProvider !== undefined &&
      compare(currentProvider(previousProvider), after).length === 0
    ) {
      continue
    }

    const { metadata, ...facts } = after

    rows.push({ ...facts, scan_at: next.scan_at, metadata_json: JSON.stringify(metadata) })
  }

  await ctx.runMutation(internal.ingestionNew.currentProviders.write, { ingestion_id, rows })
}

export const write = internalMutation({
  args: {
    ingestion_id: ingestionId,
    rows: v.array(currentProvidersTable.validator.omit('first_scan_at')),
  },
  returns: v.null(),
  handler: async (ctx, { rows, ingestion_id }) => {
    await commitStage(ctx, ingestion_id, 'currentProviders', async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_PROVIDERS_TABLE)
          .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
          .unique()

        if (existing !== null && row.scan_at <= existing.scan_at) {
          continue
        }

        const next = { ...row, first_scan_at: existing?.first_scan_at ?? row.scan_at }

        await (existing === null
          ? ctx.db.insert(CURRENT_PROVIDERS_TABLE, next)
          : ctx.db.replace(CURRENT_PROVIDERS_TABLE, existing._id, next))
      }
    })

    return null
  },
})

const omittedMetadataKeys = new Set([
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
])

function currentProvider(provider: ScannedProvider) {
  const { metadata, ...fields } = providerEntity(provider)

  return {
    ...fields,
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !omittedMetadataKeys.has(key)),
    ),
  }
}
