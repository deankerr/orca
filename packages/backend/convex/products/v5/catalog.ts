import { Endpoint } from '@orca/contract/endpoint'
import { Model } from '@orca/contract/model'
import { Provider } from '@orca/contract/provider'
import { zodOutputToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'

import { query } from '#generated/server'

import {
  CURRENT_MODELS_TABLE,
  CURRENT_PROVIDERS_TABLE,
  CURRENT_STATS_TABLE,
} from '../../catalog/tables/current'
import type { CurrentEndpointRow } from '../../catalog/tables/current'
import { windowedEndpointRows } from '../grid/endpoints'
import { toEndpoint } from './endpoints'
import { toModel } from './models'
import type { ModelListing } from './models'
import { toProvider } from './providers'
import type { ProviderListing } from './providers'

/** Count listed endpoints per model and provider. */
function summarize(rows: readonly CurrentEndpointRow[]) {
  const models = new Map<string, ModelListing & { providerIds: Set<string> }>()
  const providers = new Map<string, ProviderListing & { modelIds: Set<string> }>()

  for (const row of rows) {
    if (row.unlisted_at !== undefined) {
      continue
    }
    const model = models.get(row.model_id) ?? { endpoints: 0, providerIds: new Set() }
    model.endpoints += 1
    model.providerIds.add(row.provider_id)
    models.set(row.model_id, model)

    const provider = providers.get(row.provider_id) ?? { endpoints: 0, modelIds: new Set() }
    provider.endpoints += 1
    provider.modelIds.add(row.model_id)
    providers.set(row.provider_id, provider)
  }

  return { models, providers }
}

/**
 * Grid-window endpoints with every known model and provider and current stats, read in one transaction.
 * Models and providers stay known after their last listing ends.
 */
export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const { rows, scanAt } = await windowedEndpointRows(ctx)
    const stats = await ctx.db.query(CURRENT_STATS_TABLE).unique()
    const readings = new Map(stats?.rows.map((reading) => [reading.endpoint_id, reading]))
    const listings = summarize(rows)

    const providerRows = await ctx.db.query(CURRENT_PROVIDERS_TABLE).collect()
    const providerNames = new Map(providerRows.map((row) => [row.provider_id, row.display_name]))
    const modelRows = await ctx.db.query(CURRENT_MODELS_TABLE).collect()

    return {
      as_at: scanAt,
      endpoints: rows.map((row) =>
        toEndpoint(row, readings.get(row.endpoint_id), providerNames.get(row.provider_id)),
      ),
      models: modelRows.map((row) => toModel(row, listings.models.get(row.model_id))),
      providers: providerRows.map((row) =>
        toProvider(row, listings.providers.get(row.provider_id)),
      ),
    }
  },
  returns: v.object({
    as_at: v.union(v.null(), v.string()),
    endpoints: v.array(zodOutputToConvex(Endpoint)),
    models: v.array(zodOutputToConvex(Model)),
    providers: v.array(zodOutputToConvex(Provider)),
  }),
})
