import { parseAsString, useQueryStates } from 'nuqs'

import { baseProviderSlug } from '@/convex/shared/utils'

export function useMonitorFilters() {
  const [params, setParams] = useQueryStates(
    {
      model: parseAsString,
      provider: parseAsString,
    },
    { history: 'push', shallow: true },
  )

  return {
    modelSlug: params.model ?? '',
    providerSlug: params.provider ?? '',
    setModelSlug: (slug: string) => setParams({ model: slug || null }),
    setProviderSlug: (slug: string) =>
      setParams({ provider: slug ? baseProviderSlug(slug) : null }),
    hasActiveFilters: !!params.model || !!params.provider,
  }
}
