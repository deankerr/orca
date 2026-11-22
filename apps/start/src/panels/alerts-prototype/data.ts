// PROTOTYPE, throwaway (issue #260).
import { convexQuery } from '@convex-dev/react-query'
import type { EntityAlert } from '@orca/backend/alerts/curate'
import {
  fieldLabel,
  findFact,
  formatQuantity,
  isQuantity,
  presentChange,
} from '@orca/backend/alerts/present'
import type { Movement } from '@orca/backend/alerts/present'
import { api } from '@orca/backend/api'
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { FunctionReturnType } from 'convex/server'
import { createContext, use, useMemo } from 'react'

import { applyFilters } from '#endpoints/filtering'
import { useScopeFilters, useSnapshot } from '#endpoints/hooks'
import { activeFilterCount } from '#endpoints/scope'

import { useProto } from './proto'

/** One page of the Monitor feed: about a day of Alerts on a dev deployment. No paging in the prototype. */
const { queryKey } = convexQuery(api.products.monitor.query.feed, {
  paginationOpts: { cursor: null, numItems: 400 },
  scope: { kind: 'all' },
})

type Feed = FunctionReturnType<typeof api.products.monitor.query.feed>

const feedQuery = queryOptions<Feed, Error, Feed, typeof queryKey>({
  queryKey,
  staleTime: Infinity,
})

export interface ChangeLine {
  label: string
  text: string
  movement: Movement | null
}

export interface AlertItem {
  key: string
  at: string
  kind: EntityAlert['entity_kind']
  label: string
  tone: 'added' | 'removed' | 'updated'
  model: { id: string; name: string } | null
  provider: { id: string; name: string; tag: string | null } | null
  endpointId: string | null
  lines: ChangeLine[]
}

function lifecycleLabel(alert: EntityAlert): string {
  const kind = alert.entity_kind

  if ('changes' in alert) {
    return alert.changes.every((change) => change.field.startsWith('pricing.'))
      ? 'price'
      : 'updated'
  }

  if ('before' in alert) {
    return kind === 'endpoint' ? 'unlisted' : 'no listed endpoints'
  }

  if (alert.previously_known === false) {
    return 'discovered'
  }

  if (kind === 'endpoint') {
    return alert.previously_known === true ? 'relisted' : 'listed'
  }

  return 'has listed endpoints'
}

type Fact = Parameters<typeof isQuantity>[0]

function factText(fact: Fact): string {
  if (fact.value === null) {
    return 'none'
  }

  if (isQuantity(fact)) {
    return formatQuantity(fact)
  }

  if (fact.kind === 'flag') {
    return fact.value ? 'yes' : 'no'
  }

  if (fact.kind === 'date') {
    return fact.value.slice(0, 10)
  }

  return fact.kind === 'list' ? fact.value.join(', ') : fact.value
}

function changeLines(alert: EntityAlert): ChangeLine[] {
  if ('changes' in alert) {
    return alert.changes.map((change): ChangeLine => {
      const shown = presentChange(change, { fractionDigits: 0 })
      const label = fieldLabel(shown.field)

      switch (shown.transition) {
        case 'updated': {
          return {
            label,
            movement: shown.movement,
            text: `${factText(shown.before)} → ${factText(shown.after)}`,
          }
        }

        case 'added': {
          return { label, movement: null, text: `none → ${factText(shown.fact)}` }
        }

        case 'removed': {
          return { label, movement: null, text: `${factText(shown.fact)} → none` }
        }

        case 'members': {
          return {
            label,
            movement: null,
            text: [
              ...shown.added.map((id) => `+${id}`),
              ...shown.removed.map((id) => `−${id}`),
            ].join(' '),
          }
        }

        case 'conditions': {
          return { label, movement: null, text: shown.lines.join('; ') }
        }

        case 'opaque': {
          return { label, movement: null, text: 'changed' }
        }

        default: {
          return shown satisfies never
        }
      }
    })
  }

  if (alert.entity_kind !== 'endpoint') {
    return []
  }

  const facts = 'after' in alert ? alert.after : alert.before

  return ['pricing.input', 'pricing.output'].flatMap((field): ChangeLine[] => {
    const fact = findFact(facts, field, 'price')

    return fact === undefined || fact.value === null
      ? []
      : [{ label: fieldLabel(field), movement: null, text: formatQuantity(fact) }]
  })
}

function toneOf(alert: EntityAlert): AlertItem['tone'] {
  if ('changes' in alert) {
    return 'updated'
  }

  return 'after' in alert ? 'added' : 'removed'
}

function toItem(alert: EntityAlert): AlertItem {
  const { context } = alert
  const endpoint = 'endpoint' in context ? context.endpoint : null

  return {
    at: alert.observed_at,
    endpointId: endpoint?.endpoint_id ?? null,
    key: `${alert.entity_kind}:${alert.entity_id}:${alert.observed_at}:${alert.type}`,
    kind: alert.entity_kind,
    label: lifecycleLabel(alert),
    lines: changeLines(alert),
    model:
      'model' in context ? { id: context.model.model_id, name: context.model.display_name } : null,
    provider:
      'provider' in context
        ? {
            id: context.provider.provider_id,
            name: endpoint?.provider_display_name ?? context.provider.display_name,
            tag: endpoint?.provider_tag ?? null,
          }
        : null,
    tone: toneOf(alert),
  }
}

export interface AlertsState {
  loading: boolean
  /** Every loaded Alert, newest first. */
  all: AlertItem[]
  /** The Alerts the screen shows: `all`, or the ones the Endpoints filters keep. */
  shown: AlertItem[]
  /** Alerts the filters could not be tested against: their endpoint has left the Snapshot. */
  untestable: number
  filtered: boolean
  /** Each endpoint's Alerts, newest first. */
  byEndpoint: ReadonlyMap<string, AlertItem[]>
  /** Variant D: the Table marks rows that have Alerts. */
  marks: boolean
  /** Variant D with its toggle on: the Table keeps only rows with Alerts, newest change first. */
  changedOnly: boolean
}

const EMPTY: AlertItem[] = []

/**
 * The loaded Alerts and the ones in scope. An endpoint's Alert is in scope when its Snapshot row passes
 * the filters, ignoring the unlisted toggle so that "unlisted" Alerts survive it. A model's or
 * provider's Alert is in scope when any in-scope row belongs to it.
 */
function useAlertsState(): AlertsState {
  const { data, isPending } = useQuery(feedQuery)
  const { at, byId, rows } = useSnapshot()
  const filters = useScopeFilters()
  const { alerts, follow, variant } = useProto()

  const all = useMemo(() => data?.page.map(toItem) ?? EMPTY, [data])

  const byEndpoint = useMemo(() => {
    const map = new Map<string, AlertItem[]>()

    for (const item of all) {
      if (item.endpointId !== null) {
        map.set(item.endpointId, [...(map.get(item.endpointId) ?? []), item])
      }
    }

    return map
  }, [all])

  const filtered = follow && activeFilterCount(filters) > 0

  const scoped = useMemo(() => {
    if (!filtered) {
      return { shown: all, untestable: 0 }
    }

    const inScope = applyFilters(rows, { ...filters, unlisted: true }, at)
    const endpoints = new Set(inScope.map((row) => row.id))
    const models = new Set(inScope.map((row) => row.model.id))
    const providers = new Set(inScope.map((row) => row.provider.id))
    let untestable = 0

    const shown = all.filter((item) => {
      if (item.endpointId !== null) {
        if (!byId.has(item.endpointId)) {
          untestable += 1

          return false
        }

        return endpoints.has(item.endpointId)
      }

      return item.kind === 'model'
        ? item.model !== null && models.has(item.model.id)
        : item.provider !== null && providers.has(item.provider.id)
    })

    return { shown, untestable }
  }, [all, at, byId, filtered, filters, rows])

  return {
    all,
    byEndpoint,
    changedOnly: variant === 'D' && alerts,
    filtered,
    loading: isPending,
    marks: variant === 'D',
    ...scoped,
  }
}

const AlertsContext = createContext<AlertsState | null>(null)

/** Provided once by the page, so a thousand Table rows can read it without a query observer each. */
export const AlertsProvider = AlertsContext.Provider

export { useAlertsState }

/** For the Table's cells, which also render where no provider is. */
export function useAlertsMaybe(): AlertsState | null {
  return use(AlertsContext)
}

export function useAlerts(): AlertsState {
  const state = use(AlertsContext)

  if (state === null) {
    throw new Error('AlertsProvider is missing')
  }

  return state
}

/** Alerts grouped by the scan that observed them, newest scan first. */
export function byScan(items: readonly AlertItem[]): { at: string; items: AlertItem[] }[] {
  const groups: { at: string; items: AlertItem[] }[] = []

  for (const item of items) {
    const last = groups.at(-1)

    if (last !== undefined && last.at === item.at) {
      last.items.push(item)
    } else {
      groups.push({ at: item.at, items: [item] })
    }
  }

  return groups
}

/** `08:40 · 2h ago`, against the Snapshot's time. */
export function scanLabel(at: string, now: string) {
  const date = new Date(at)
  const hours = Math.round((new Date(now).getTime() - date.getTime()) / 3_600_000)

  return {
    ago: hours <= 0 ? 'latest scan' : `${hours}h ago`,
    clock: date.toLocaleString('en-US', {
      day: 'numeric',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: 'short',
    }),
  }
}
