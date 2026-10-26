import { parseAsString } from 'nuqs'

import { href } from '@/lib/href'

const PRICING_HISTORY_PARAM = 'pricing-history'

export const pricingHistoryParsers = {
  pricingHistory: parseAsString,
}

export const pricingHistoryStateOptions = {
  history: 'push' as const,
  shallow: true,
  urlKeys: {
    pricingHistory: PRICING_HISTORY_PARAM,
  },
}

const STALE_QUERY_KEYS = ['overviewModel', 'overviewProvider', 'chart', 'history'] as const

export function pricingHistoryModelIdFromParams(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''

  return trimmed === '' ? null : trimmed
}

interface PricingHistoryQueryPatch {
  pricingHistory: string | null
}

export function pricingHistoryQueryPatch(modelId: string | null): PricingHistoryQueryPatch {
  return { pricingHistory: modelId }
}

export function buildPricingHistoryHref({
  pathname,
  searchParams,
  modelId,
}: {
  pathname: string
  searchParams: string | URLSearchParams
  modelId: string
}): string {
  const next = new URLSearchParams(searchParams)

  for (const key of STALE_QUERY_KEYS) {
    next.delete(key)
  }

  next.set(PRICING_HISTORY_PARAM, modelId)

  return href(pathname, next)
}

export function buildLegacyPricingHistoryHref(modelIdSegments: string[]): string {
  const modelId = modelIdSegments.map((part) => decodeURIComponent(part)).join('/')

  if (pricingHistoryModelIdFromParams(modelId) === null) {
    return '/'
  }

  return buildPricingHistoryHref({ modelId, pathname: '/', searchParams: '' })
}
