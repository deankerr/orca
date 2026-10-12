import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ExtractedProvider } from '#scans/extraction'

import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from '../catalog/tables/current'
import type { CurrentProviderRow } from '../catalog/tables/current'
import { compare } from '../compare'
import type { ScanPair } from './input'
import { providerEntity } from './lenses'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { previous, next }: ScanPair,
  registration_id: RegistrationId,
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

  await ctx.runMutation(internal.ingestion.currentProviders.write, { registration_id, rows })
}

export const write = internalMutation({
  args: {
    registration_id: registrationId,
    rows: v.array(currentProvidersTable.validator.omit('first_scan_at')),
  },
  returns: v.null(),
  handler: async (ctx, { rows, registration_id }) => {
    await commitProcess(ctx, registration_id, 'currentProviders', async () => {
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

export function currentProvider(provider: ExtractedProvider) {
  const { metadata, ...fields } = providerEntity(provider)

  return {
    ...fields,
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !omittedMetadataKeys.has(key)),
    ),
  }
}
