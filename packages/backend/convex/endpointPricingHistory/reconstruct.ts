import * as R from 'remeda'

import { PRICING_FIELD_KEYS } from '../../shared/formatters'
import type { PricingKey } from '../../shared/formatters'

export const trackedPricingFields = PRICING_FIELD_KEYS

export type TrackedPricingField = PricingKey

export type TrackedPricing = Partial<Record<TrackedPricingField, number>>

export type PricingHistoryEndpoint = {
  uuid: string
  provider: {
    slug: string
    tag_slug: string
    name: string
    model_id: string
  }
  pricing: TrackedPricing
  unavailable_at?: number
}

export type PricingHistoryChange = {
  crawl_id: string
  previous_crawl_id: string
  endpoint_uuid: string
  change_kind: 'create' | 'update' | 'delete'
  path?: string
  before?: unknown
  after?: unknown
}

export type PricingHistoryPoint = {
  at: number
  available: boolean
  pricing: TrackedPricing
}

export type PricingHistorySeries = {
  endpointUuid: string
  provider: PricingHistoryEndpoint['provider']
  points: PricingHistoryPoint[]
}

export function takeRecentCompleteCrawls(
  changes: readonly PricingHistoryChange[],
  maximumDocuments: number,
): {
  changes: readonly PricingHistoryChange[]
  oldestExactTimestamp: number | undefined
  truncated: boolean
} {
  if (changes.length <= maximumDocuments) {
    return { changes, oldestExactTimestamp: undefined, truncated: false }
  }

  const boundaryCrawlId = changes[maximumDocuments]?.crawl_id
  const retainedChanges = changes
    .slice(0, maximumDocuments)
    .filter((change) => change.crawl_id !== boundaryCrawlId)
  const oldestRetainedChange = retainedChanges.at(-1)

  return {
    changes: retainedChanges,
    oldestExactTimestamp: Number(oldestRetainedChange?.previous_crawl_id ?? changes[0]?.crawl_id),
    truncated: true,
  }
}

type EndpointState = {
  available: boolean
  pricing: TrackedPricing
  knownPricing: Record<TrackedPricingField, boolean>
  points: PricingHistoryPoint[]
}

type ChangeGroup = [PricingHistoryChange, ...PricingHistoryChange[]]

// Change documents retain materialized-storage paths, while the API exposes the
// catalog projection's names. Keep that translation at the reconstruction seam.
const PRICING_PATHS = new Map<string, TrackedPricingField>([
  ['pricing.text_input', 'text_input'],
  ['pricing.text_output', 'text_output'],
  ['pricing.cache_read', 'text_cache_read'],
  ['pricing.cache_write', 'text_cache_write'],
  ['pricing.internal_reasoning', 'reasoning_output'],
  ['pricing.audio_input', 'audio_input'],
  ['pricing.audio_cache_input', 'audio_cache_write'],
  ['pricing.image_input', 'image_input'],
  ['pricing.image_output', 'image_output'],
  ['pricing.web_search', 'web_search'],
  ['pricing.discount', 'discount'],
])

function priceValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function createPoint(at: number, state: EndpointState): PricingHistoryPoint {
  const pricing: TrackedPricing = {}

  for (const field of trackedPricingFields) {
    if (state.knownPricing[field] && state.pricing[field] !== undefined) {
      pricing[field] = state.pricing[field]
    }
  }

  return { at, available: state.available, pricing }
}

function setPrice(state: EndpointState, field: TrackedPricingField, value: unknown): void {
  state.knownPricing[field] = true
  const price = priceValue(value)
  state.pricing[field] = price
}

function forgetPrices(state: EndpointState): void {
  for (const field of trackedPricingFields) {
    state.knownPricing[field] = false
  }
  state.pricing = {}
}

function addPoint(state: EndpointState, point: PricingHistoryPoint): void {
  const previous = state.points.at(-1)
  if (previous?.at === point.at) {
    state.points[state.points.length - 1] = point
  } else {
    state.points.push(point)
  }
}

function createTerminalStates(endpoints: readonly PricingHistoryEndpoint[]) {
  return new Map(
    endpoints.map((endpoint) => [
      endpoint.uuid,
      {
        available: endpoint.unavailable_at === undefined,
        pricing: { ...endpoint.pricing },
        knownPricing: R.mapToObj(trackedPricingFields, (field) => [field, true]),
        points: [],
      } satisfies EndpointState,
    ]),
  )
}

function recordBoundary(states: ReadonlyMap<string, EndpointState>, at: number) {
  for (const state of states.values()) {
    addPoint(state, createPoint(at, state))
  }
}

function groupRelevantChanges(changes: readonly PricingHistoryChange[]) {
  const groups = new Map<string, ChangeGroup>()
  const relevantChanges = changes
    .filter(
      (change) =>
        change.change_kind !== 'update' ||
        (change.path !== undefined && PRICING_PATHS.has(change.path)),
    )
    .toSorted((left, right) => Number(right.crawl_id) - Number(left.crawl_id))

  for (const change of relevantChanges) {
    const key = `${change.crawl_id}:${change.endpoint_uuid}`
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, [change])
    } else {
      group.push(change)
    }
  }

  return groups.values()
}

function rewindEndpointState(state: EndpointState, changes: ChangeGroup) {
  const [firstChange] = changes

  // Record the exact post-change state before undoing the crawl. Applying `after` also restores
  // price knowledge that may have been cleared when a later availability period was crossed.
  for (const change of changes) {
    if (change.change_kind === 'update' && change.path !== undefined) {
      const field = PRICING_PATHS.get(change.path)
      if (field !== undefined) {
        setPrice(state, field, change.after)
      }
    }
  }

  addPoint(state, createPoint(Number(firstChange.crawl_id), state))

  for (const change of changes) {
    if (change.change_kind === 'update' && change.path !== undefined) {
      const field = PRICING_PATHS.get(change.path)
      if (field !== undefined) {
        setPrice(state, field, change.before)
      }
    } else if (change.change_kind === 'delete') {
      state.available = true
    } else if (change.change_kind === 'create') {
      state.available = false
      forgetPrices(state)
    }
  }
}

function pricingSeriesFromStates(args: {
  endpointsByUuid: ReadonlyMap<string, PricingHistoryEndpoint>
  states: ReadonlyMap<string, EndpointState>
}) {
  const series: PricingHistorySeries[] = []

  for (const [endpointUuid, state] of args.states) {
    const points = state.points.toReversed()
    const endpoint = args.endpointsByUuid.get(endpointUuid)

    if (endpoint !== undefined && points.some((point) => point.available)) {
      series.push({ endpointUuid, provider: endpoint.provider, points })
    }
  }

  return series.toSorted(
    (left, right) =>
      left.provider.name.localeCompare(right.provider.name) ||
      left.provider.tag_slug.localeCompare(right.provider.tag_slug),
  )
}

/**
 * Reconstruct sparse endpoint states by walking changes backward from the retained catalog state.
 * A create event has no pricing payload, so crossing it deliberately forgets prices instead of
 * leaking a later availability period's prices into an earlier one.
 */
export function reconstructPricingHistory(args: {
  endpoints: readonly PricingHistoryEndpoint[]
  changes: readonly PricingHistoryChange[]
  since: number
  asOf: number
}): PricingHistorySeries[] {
  const endpointsByUuid = new Map(args.endpoints.map((endpoint) => [endpoint.uuid, endpoint]))
  const states = createTerminalStates(args.endpoints)

  recordBoundary(states, args.asOf)

  for (const changes of groupRelevantChanges(args.changes)) {
    const [firstChange] = changes
    const state = states.get(firstChange.endpoint_uuid)
    if (state !== undefined) {
      rewindEndpointState(state, changes)
    }
  }

  recordBoundary(states, args.since)
  return pricingSeriesFromStates({ endpointsByUuid, states })
}
