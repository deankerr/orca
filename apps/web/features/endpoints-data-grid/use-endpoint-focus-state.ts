import { parseAsString, useQueryStates } from 'nuqs'

const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

export function useEndpointFocusState() {
  const [params, setParams] = useQueryStates(
    {
      uuid: parseAsString,
    },
    endpointGridStateOptions,
  )

  const highlightUuid = params.uuid?.trim() ?? ''

  const setHighlightUuid = (value: string) => {
    const normalizedValue = value.trim()
    void setParams({
      uuid: normalizedValue === '' ? null : normalizedValue,
    })
  }

  const clearHighlightUuid = () => {
    void setParams({ uuid: null })
  }

  return {
    highlightUuid,
    hasFocus: highlightUuid.length > 0,
    setHighlightUuid,
    clearHighlightUuid,
  }
}
