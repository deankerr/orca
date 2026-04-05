import { parseAsString, useQueryStates } from 'nuqs'

import { baseProviderSlug } from '@/shared/utils'

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
    setModelSlug: (slug: string) => {
      void setParams({ model: slug === '' ? null : slug })
    },
    setProviderSlug: (slug: string) => {
      void setParams({ provider: slug === '' ? null : baseProviderSlug(slug) })
    },
    hasActiveFilters: params.model !== null || params.provider !== null,
  }
}
