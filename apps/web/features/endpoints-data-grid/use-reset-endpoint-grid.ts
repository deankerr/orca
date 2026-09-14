import { useQueryStates } from 'nuqs'

import {
  endpointGridParsers,
  endpointGridResetPatch,
  endpointGridStateOptions,
} from './query-state'

export function useResetEndpointGrid() {
  const [, setParams] = useQueryStates(endpointGridParsers, endpointGridStateOptions)

  return () => {
    void setParams(endpointGridResetPatch)
  }
}
