import { href, pickParams, toSearchParams } from '@/lib/href'

import { endpointGridQueryKeys, normalizeEndpointGridQuery } from './query-state'

export function buildEndpointGridHref({
  query,
  uuid,
}: {
  query?: string | null
  uuid?: string | null
}) {
  const params = new URLSearchParams()
  const normalizedQuery = normalizeEndpointGridQuery(query ?? '')
  const normalizedUuid = uuid?.trim() ?? ''

  if (normalizedQuery) {
    params.set('q', normalizedQuery)
  }

  if (normalizedUuid) {
    params.set('uuid', normalizedUuid)
  }

  return href('/', params)
}

export function buildEndpointsHref({
  pathname,
  searchParams,
  slug,
}: {
  pathname: string
  searchParams: string | URLSearchParams
  slug: string
}): string {
  if (pathname === '/') {
    const current = toSearchParams(searchParams)
    const next = pickParams(current, endpointGridQueryKeys)

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
