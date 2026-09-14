import { parseAsString, useQueryStates } from 'nuqs'

const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

export function normalizeEndpointGridQuery(value: string) {
  return value.trim()
}

export function hasEndpointGridQuery(value: string) {
  return normalizeEndpointGridQuery(value).length > 0
}

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

  const search = params.toString()
  return search ? `/?${search}` : '/'
}

export function useEndpointQueryState() {
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString,
    },
    endpointGridStateOptions,
  )

  const query = params.q ?? ''

  const setQuery = (value: string) => {
    const normalizedValue = normalizeEndpointGridQuery(value)
    void setParams({
      q: normalizedValue === '' ? null : value,
    })
  }

  const clearQuery = () => {
    void setParams({ q: null })
  }

  return {
    query,
    hasQuery: hasEndpointGridQuery(query),
    setQuery,
    clearQuery,
  }
}
