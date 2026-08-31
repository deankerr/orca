import type { Infer } from 'convex/values'
import type { IChange } from 'json-diff-ts'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { providersTable } from '../tables/providers'
import { appendRows, applyUnlists, applyUpserts, rewriteIfEmpty, valuesById } from './chunks'
import { compare } from './compare'
import type { MapChange } from './compare'
import type { Catalog, SourceEndpoint } from './explode'
import {
  collectStatsRows,
  hasPricing,
  toEndpointRow,
  toModelRow,
  toPricingRow,
  toProviderRow,
} from './flatten'

type ProviderRow = Infer<typeof providersTable.validator>
type ViewEffect = 'upsert' | 'skip'
type PricingEffect = 'append' | 'skip'

// pricing-only IChange still upserts the view
const VIEW_SKIP_KEYS = new Set<string>()
const PRICING_TRIGGER_KEYS = new Set(['pricing'])

/**
 * Walk the catalog diff and write view/series chunks. Does not load blobs or
 * advance the ingest window.
 *
 * Reverse-time apply of an older-than-earliest artifact is not specified;
 * this walk is latest-edge (and empty-before) only.
 */
export async function apply(
  ctx: ActionCtx,
  args: { scan_at: string; before: Catalog; after: Catalog },
): Promise<void> {
  const [modelsHaveRows, endpointsHaveRows, providersHaveRows]: [boolean, boolean, boolean] =
    await Promise.all([
      ctx.runQuery(internal.meps2.projections.writes.models.hasRows, {}),
      ctx.runQuery(internal.meps2.projections.writes.endpoints.hasRows, {}),
      ctx.runQuery(internal.meps2.projections.writes.providers.hasRows, {}),
    ])

  const diff = compare(args.before, args.after)
  const planned = planEndpoints(diff.endpoints)

  const modelView = rewriteIfEmpty(
    modelsHaveRows,
    args.after.models,
    diff.models.flatMap((change) => (change.kind === 'absent' ? [] : [change.next])),
  )
  const endpointView = rewriteIfEmpty(endpointsHaveRows, args.after.endpoints, planned.viewUpserts)
  const unlists = endpointView.rewrite ? [] : planned.viewUnlists

  const providerSources = endpointView.rewrite
    ? valuesById(args.after.endpoints)
    : endpointView.upserts
  const providerView = rewriteIfEmpty(
    providersHaveRows,
    providerMap(args.after.endpoints, args.scan_at),
    uniqueProviders(providerSources, args.scan_at),
  )

  const models = await applyUpserts(
    modelView.upserts.map((model) => toModelRow(model, args.scan_at)),
    async (upserts): Promise<{ upserted: number }> =>
      await ctx.runMutation(internal.meps2.projections.writes.models.upsert, { upserts }),
  )
  const endpoints = await applyUpserts(
    endpointView.upserts.map((endpoint) => toEndpointRow(endpoint, args.scan_at)),
    async (upserts): Promise<{ upserted: number }> =>
      await ctx.runMutation(internal.meps2.projections.writes.endpoints.upsert, { upserts }),
  )
  const providers = await applyUpserts(
    providerView.upserts,
    async (upserts): Promise<{ upserted: number }> =>
      await ctx.runMutation(internal.meps2.projections.writes.providers.upsert, { upserts }),
  )
  const unlisted = await applyUnlists(
    unlists,
    async (endpoint_ids): Promise<{ unlisted: number }> =>
      await ctx.runMutation(internal.meps2.projections.writes.endpoints.unlist, {
        endpoint_ids,
        scan_at: args.scan_at,
      }),
  )
  const pricing = await appendRows(
    planned.pricingAppends.flatMap((endpoint) => {
      const row = toPricingRow(endpoint, args.scan_at)
      return row === null ? [] : [row]
    }),
    async (rows): Promise<{ inserted: number }> =>
      await ctx.runMutation(internal.meps2.projections.writes.pricing.insert, { rows }),
  )
  const stats = await appendRows(
    collectStatsRows(args.after.endpoints, args.scan_at),
    async (rows): Promise<{ inserted: number }> =>
      await ctx.runMutation(internal.meps2.projections.writes.stats.insert, { rows }),
  )

  console.log('[meps2:projections]', {
    scan_at: args.scan_at,
    models: { rewrite: modelView.rewrite, upserted: models.upserted },
    endpoints: {
      rewrite: endpointView.rewrite,
      upserted: endpoints.upserted,
      unlisted: unlisted.unlisted,
    },
    providers: { rewrite: providerView.rewrite, upserted: providers.upserted },
    pricing: pricing.inserted,
    stats: stats.inserted,
  })
}

function planEndpoints(changes: MapChange<SourceEndpoint>[]) {
  const viewUpserts: SourceEndpoint[] = []
  const viewUnlists: string[] = []
  const pricingAppends: SourceEndpoint[] = []

  for (const change of changes) {
    if (change.kind === 'absent') {
      viewUnlists.push(change.id)
      continue
    }

    if (change.kind === 'create') {
      viewUpserts.push(change.next)
      if (hasPricing(change.next)) {
        pricingAppends.push(change.next)
      }
      continue
    }

    if (viewEffect(change.changeset) === 'upsert') {
      viewUpserts.push(change.next)
    }
    if (pricingEffect(change.changeset, change.next) === 'append') {
      pricingAppends.push(change.next)
    }
  }

  return { viewUpserts, viewUnlists, pricingAppends }
}

function viewEffect(changeset: IChange[]): ViewEffect {
  return changeset.some((change) => !VIEW_SKIP_KEYS.has(change.key)) ? 'upsert' : 'skip'
}

function pricingEffect(changeset: IChange[], next: SourceEndpoint): PricingEffect {
  if (!hasPricing(next)) {
    return 'skip'
  }
  return changeset.some((change) => PRICING_TRIGGER_KEYS.has(change.key)) ? 'append' : 'skip'
}

function uniqueProviders(endpoints: SourceEndpoint[], scan_at: string): ProviderRow[] {
  const byId = new Map<string, ProviderRow>()
  for (const endpoint of endpoints) {
    const row = toProviderRow(endpoint, scan_at)
    byId.set(row.provider_id, row)
  }
  return [...byId.values()]
}

function providerMap(endpoints: Map<string, SourceEndpoint>, scan_at: string) {
  const map = new Map<string, ProviderRow>()
  for (const endpoint of valuesById(endpoints)) {
    const row = toProviderRow(endpoint, scan_at)
    map.set(row.provider_id, row)
  }
  return map
}
