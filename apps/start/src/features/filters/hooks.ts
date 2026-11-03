import { useMemo } from 'react'

import { useCatalog } from '#features/endpoints/hooks'

import { catalogOptions, createOptionSearch } from './options'

/** Every model and provider in the catalogue, with searches over each kind and over both. */
export function useCatalogOptions() {
  const { rows } = useCatalog()

  return useMemo(() => {
    const options = catalogOptions(rows)

    return {
      options,
      search: {
        any: createOptionSearch([...options.model, ...options.provider]),
        model: createOptionSearch(options.model),
        provider: createOptionSearch(options.provider),
      },
    }
  }, [rows])
}
