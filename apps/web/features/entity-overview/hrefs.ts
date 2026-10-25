import { href, pickParams } from '@/lib/href'

const MONITOR_QUERY_KEYS = ['model', 'provider'] as const

export function buildMonitorHref({
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
  const value = type === 'provider' ? slug.replace(/\/.*$/u, '') : slug

  if (pathname === '/monitor') {
    const next = pickParams(new URLSearchParams(searchParams), MONITOR_QUERY_KEYS)
    next.set(key, value)

    return href('/monitor', next)
  }

  const next = new URLSearchParams()
  next.set(key, value)

  return href('/monitor', next)
}
