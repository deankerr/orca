import { useQueryStates } from 'nuqs'

import { endpointGridParsers, endpointGridStateOptions } from './query-state'

export function useEndpointFocusState() {
  const [params] = useQueryStates({ uuid: endpointGridParsers.uuid }, endpointGridStateOptions)

  const highlightUuid = params.uuid?.trim() ?? ''

  return {
    highlightUuid,
    hasFocus: highlightUuid.length > 0,
  }
}
