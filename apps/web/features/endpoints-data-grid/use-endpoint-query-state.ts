import { useQueryStates } from 'nuqs'

import { endpointGridParsers, endpointGridStateOptions, hasEndpointGridQuery } from './query-state'

export function useEndpointQueryState() {
  const [params, setParams] = useQueryStates({ q: endpointGridParsers.q }, endpointGridStateOptions)

  const query = params.q ?? ''

  const setQuery = (value: string) => {
    void setParams({ q: hasEndpointGridQuery(value) ? value : null })
  }

  return {
    query,
    hasQuery: hasEndpointGridQuery(query),
    setQuery,
  }
}
