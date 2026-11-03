import { useMemo } from 'react'

import { useSnapshot } from '#endpoints/hooks'

import { snapshotOptions, createOptionSearch } from './options'

/** Every model and provider in the catalogue, with searches over each kind and over both. */
export function useSnapshotOptions() {
  const { rows } = useSnapshot()

  return useMemo(() => {
    const options = snapshotOptions(rows)

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
