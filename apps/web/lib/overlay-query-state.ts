import { baseProviderSlug } from '@orca/backend/convex/shared/utils'
import { parseAsString } from 'nuqs'

export const overlayStateParsers = {
  chart: parseAsString,
}

export const overlayStateOptions = {
  history: 'push' as const,
  shallow: true,
}

const GRID_QUERY_KEYS = ['q', 'uuid', 'has', 'not', 'sort', 'order'] as const
const MONITOR_QUERY_KEYS = ['model', 'provider'] as const
const STALE_OVERVIEW_QUERY_KEYS = ['overviewModel', 'overviewProvider'] as const

export function chartModelIdFromParams(chart: string | null): string | null {
  const trimmed = chart?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export function chartQueryPatch(modelId: string | null): { chart: string | null } {
  return { chart: modelId }
}

export function buildOverviewEndpointsHref({
  pathname,
  searchParams,
  slug,
}: {
  pathname: string
  searchParams: string | URLSearchParams
  slug: string
}): string {
  if (isEndpointsPath(pathname)) {
    const current = toSearchParams(searchParams)
    const next = pickParams(current, GRID_QUERY_KEYS)
    if ((next.get('q') ?? '') !== slug) {
      next.delete('uuid')
    }
    next.set('q', slug)
    return href('/', next)
  }

  const next = new URLSearchParams()
  next.set('q', slug)
  return href('/', next)
}

export function buildOverviewMonitorHref({
  pathname,
  searchParams,
  type,
  slug,
}: {
  pathname: string
  searchParams: string | URLSearchParams
  type: 'model' | 'provider'
  slug: string
}): string {
  const key = type === 'model' ? 'model' : 'provider'
  const value = type === 'provider' ? baseProviderSlug(slug) : slug

  if (isMonitorPath(pathname)) {
    const next = pickParams(toSearchParams(searchParams), MONITOR_QUERY_KEYS)
    next.set(key, value)
    return href('/monitor', next)
  }

  const next = new URLSearchParams()
  next.set(key, value)
  return href('/monitor', next)
}

export function buildOverviewChartHref({
  pathname,
  searchParams,
  modelId,
}: {
  pathname: string
  searchParams: string | URLSearchParams
  modelId: string
}): string {
  const next = toSearchParams(searchParams)
  for (const key of STALE_OVERVIEW_QUERY_KEYS) {
    next.delete(key)
  }
  next.set('chart', modelId)
  return href(pathname, next)
}

function isEndpointsPath(pathname: string) {
  return pathname === '/'
}

function isMonitorPath(pathname: string) {
  return pathname === '/monitor'
}

function toSearchParams(search: string | URLSearchParams): URLSearchParams {
  if (typeof search === 'string') {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  }
  return new URLSearchParams(search)
}

function pickParams(from: URLSearchParams, keys: readonly string[]): URLSearchParams {
  const next = new URLSearchParams()
  for (const key of keys) {
    for (const value of from.getAll(key)) {
      next.append(key, value)
    }
  }
  return next
}

function href(path: string, params: URLSearchParams): string {
  const search = params.toString()
  return search === '' ? path : `${path}?${search}`
}
