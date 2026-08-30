import type { Infer } from 'convex/values'
import type { IChange, Options as DiffOptions } from 'json-diff-ts'

import { internal } from '../../_generated/api'
import type { ActionCtx } from '../../_generated/server'
import type { CatalogEndpoint } from '../catalog/v1'
import type { pricingTable } from '../tables/pricing'
import type { statsTable } from '../tables/stats'
import { appendRows, applyUnlists, applyUpserts, rewriteIfEmpty, valuesById } from './apply/chunks'
import { compareMaps } from './compare'
import type { MapChange } from './compare'

type PricingRow = Infer<typeof pricingTable.validator>
type StatsRow = Infer<typeof statsTable.validator>
type ViewEffect = 'upsert' | 'unlist' | 'skip'
type PricingEffect = 'append' | 'skip'

type EndpointPlan = {
  viewUpserts: CatalogEndpoint[]
  viewUnlists: string[]
  pricingAppends: CatalogEndpoint[]
  log: {
    id: string
    kind: MapChange<CatalogEndpoint>['kind']
    changeset?: IChange[]
    view: ViewEffect
    pricing: PricingEffect
  }[]
}

const DIFF_OPTIONS: DiffOptions = {
  // stats are always appended and must not dirty the view
  keysToSkip: ['stats'],
  embeddedObjKeys: {
    'metadata.supported_parameters': '$value',
    'metadata.excluded_parameters': '$value',
  },
  treatTypeChangeAsReplace: false,
}

// empty: a pricing-only IChange still upserts the view (accepted base).
// later this can be `new Set(['pricing'])` without changing callers.
const VIEW_SKIP_KEYS = new Set<string>()
const PRICING_TRIGGER_KEYS = new Set(['pricing'])

export async function projectEndpoints(
  ctx: ActionCtx,
  args: {
    before: Map<string, CatalogEndpoint>
    after: Map<string, CatalogEndpoint>
    timestamp: number
  },
) {
  const hasRows = await ctx.runQuery(internal.meps2.projections.apply.endpoints.hasRows, {})
  const planned = planEndpoints(args.before, args.after)
  const view = rewriteIfEmpty(hasRows, args.after, {
    upserts: planned.viewUpserts,
    deletes: [],
  })
  const unlists = view.rewrite ? [] : planned.viewUnlists

  logEndpointPlan(planned, {
    rewrite: view.rewrite,
    upserts: view.upserts.length,
    unlists: unlists.length,
  })

  const applied = await applyUpserts(
    view.upserts.map((endpoint) => toEndpointRow(endpoint, args.timestamp)),
    async (upserts) =>
      await ctx.runMutation(internal.meps2.projections.apply.endpoints.apply, { upserts }),
  )

  const unlisted = await applyUnlists(
    unlists,
    async (endpoint_ids) =>
      await ctx.runMutation(internal.meps2.projections.apply.endpoints.unlist, {
        endpoint_ids,
        unlisted_at: args.timestamp,
      }),
  )
  console.log('[meps2:endpoints] unlisted', unlisted)

  const pricing = await appendRows(
    planned.pricingAppends.flatMap((endpoint) => {
      const row = toPricingRow(endpoint, args.timestamp)
      return row === null ? [] : [row]
    }),
    async (rows) =>
      await ctx.runMutation(internal.meps2.projections.apply.endpoints.appendPricing, { rows }),
  )
  console.log('[meps2:endpoints] pricing', pricing)

  const stats = await appendRows(
    collectStatsRows(args.after, args.timestamp),
    async (rows) =>
      await ctx.runMutation(internal.meps2.projections.apply.endpoints.appendStats, { rows }),
  )
  console.log('[meps2:endpoints] stats', stats)

  return {
    upserted: applied.upserted,
    unlisted: unlisted.unlisted,
    pricing_samples: pricing.inserted,
    stats_samples: stats.inserted,
  }
}

export function planEndpoints(
  before: Map<string, CatalogEndpoint>,
  after: Map<string, CatalogEndpoint>,
): EndpointPlan {
  const viewUpserts: CatalogEndpoint[] = []
  const viewUnlists: string[] = []
  const pricingAppends: CatalogEndpoint[] = []
  const log: EndpointPlan['log'] = []

  for (const change of compareMaps(before, after, DIFF_OPTIONS)) {
    if (change.kind === 'absent') {
      viewUnlists.push(change.id)
      log.push({ id: change.id, kind: 'absent', view: 'unlist', pricing: 'skip' })
      continue
    }

    if (change.kind === 'create') {
      const pricing: PricingEffect = change.next.pricing === null ? 'skip' : 'append'
      viewUpserts.push(change.next)
      if (pricing === 'append') {
        pricingAppends.push(change.next)
      }
      log.push({ id: change.id, kind: 'create', view: 'upsert', pricing })
      continue
    }

    const view = viewEffect(change.changeset)
    const pricing = pricingEffect(change.changeset, change.next)
    if (view === 'upsert') {
      viewUpserts.push(change.next)
    }
    if (pricing === 'append') {
      pricingAppends.push(change.next)
    }
    log.push({
      id: change.id,
      kind: 'update',
      changeset: change.changeset,
      view,
      pricing,
    })
  }

  return { viewUpserts, viewUnlists, pricingAppends, log }
}

function viewEffect(changeset: IChange[]): ViewEffect {
  return changeset.some((change) => !VIEW_SKIP_KEYS.has(change.key)) ? 'upsert' : 'skip'
}

function pricingEffect(changeset: IChange[], next: CatalogEndpoint): PricingEffect {
  if (next.pricing === null) {
    return 'skip'
  }
  return changeset.some((change) => PRICING_TRIGGER_KEYS.has(change.key)) ? 'append' : 'skip'
}

function toEndpointRow(endpoint: CatalogEndpoint, updated_at: number) {
  return {
    updated_at,
    endpoint_id: endpoint.endpoint_id,
    model_id: endpoint.model_id,
    variant: endpoint.variant,
    provider_tag: endpoint.provider_tag,
    provider_id: endpoint.provider_id,
    metadata: endpoint.metadata,
  }
}

function toPricingRow(endpoint: CatalogEndpoint, timestamp: number): PricingRow | null {
  const { pricing } = endpoint
  if (pricing === null) {
    return null
  }

  const row: PricingRow = {
    endpoint_id: endpoint.endpoint_id,
    timestamp,
    prompt: pricing.prompt,
    completion: pricing.completion,
    discount: pricing.discount,
  }

  if (pricing.image !== undefined) {
    row.image = pricing.image
  }
  if (pricing.image_output !== undefined) {
    row.image_output = pricing.image_output
  }
  if (pricing.input_cache_read !== undefined) {
    row.input_cache_read = pricing.input_cache_read
  }
  if (pricing.input_cache_write !== undefined) {
    row.input_cache_write = pricing.input_cache_write
  }
  if (pricing.input_cache_write_1h !== undefined) {
    row.input_cache_write_1h = pricing.input_cache_write_1h
  }
  if (pricing.audio !== undefined) {
    row.audio = pricing.audio
  }
  if (pricing.input_audio_cache !== undefined) {
    row.input_audio_cache = pricing.input_audio_cache
  }
  if (pricing.web_search !== undefined) {
    row.web_search = pricing.web_search
  }
  if (pricing.display_pricing !== undefined) {
    row.display_pricing = pricing.display_pricing
  }
  if (pricing.overrides !== undefined) {
    row.overrides = pricing.overrides
  }

  return row
}

function collectStatsRows(endpoints: Map<string, CatalogEndpoint>, timestamp: number): StatsRow[] {
  const rows: StatsRow[] = []

  for (const endpoint of valuesById(endpoints)) {
    if (endpoint.stats === null) {
      continue
    }

    for (const tier of Object.keys(endpoint.stats).toSorted()) {
      const sample = endpoint.stats[tier]
      if (sample === undefined || Object.keys(sample).length === 0) {
        continue
      }

      rows.push({
        endpoint_id: endpoint.endpoint_id,
        timestamp,
        tier,
        sample,
      })
    }
  }

  return rows
}

function logEndpointPlan(
  planned: EndpointPlan,
  counts: { rewrite: boolean; upserts: number; unlists: number },
) {
  console.log('[meps2:endpoints] view', {
    ...counts,
    creates: planned.log.filter((entry) => entry.kind === 'create').map((entry) => entry.id),
    absent: planned.log.filter((entry) => entry.kind === 'absent').map((entry) => entry.id),
  })
  for (const entry of planned.log) {
    if (entry.kind === 'update') {
      console.log(`[meps2:endpoints] update: ${entry.id}`, entry.changeset)
    }
  }
}
