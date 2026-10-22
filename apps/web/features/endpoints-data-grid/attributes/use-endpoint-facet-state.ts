import { useQueryStates } from 'nuqs'

import { endpointGridParsers, endpointGridStateOptions } from '../query-state'
import type { AttributeKey } from './attributes'
import {
  applyFilterMode,
  countActiveAttributeFilters,
  countActiveModalityFilters,
  omitModalityFilters,
  retainModalityFilters,
  toAttributeFilters,
  toFacetFilters,
  toModalityFilters,
} from './facet-state'
import type { FilterMode } from './facet-state'

export function useEndpointFacetState() {
  const [params, setParams] = useQueryStates(
    { has: endpointGridParsers.has, not: endpointGridParsers.not },
    endpointGridStateOptions,
  )

  const activeAttributeCount = countActiveAttributeFilters(params.has, params.not)
  const activeModalityCount = countActiveModalityFilters(params.has, params.not)

  const setFilter = (key: AttributeKey, value: FilterMode) => {
    void setParams(applyFilterMode({ has: params.has, key, mode: value, not: params.not }))
  }

  const clearAttributeFilters = () => {
    void setParams({
      has: retainModalityFilters(params.has),
      not: retainModalityFilters(params.not),
    })
  }

  const clearModalityFilters = () => {
    void setParams({
      has: omitModalityFilters(params.has),
      not: omitModalityFilters(params.not),
    })
  }

  return {
    activeAttributeCount,
    activeModalityCount,
    attributeFilters: toAttributeFilters(params.has, params.not),
    clearAttributeFilters,
    clearModalityFilters,
    facetFilters: toFacetFilters(params.has, params.not),
    hasActiveFacets: activeAttributeCount > 0 || activeModalityCount > 0,
    modalityFilters: toModalityFilters(params.has, params.not),
    setAttributeFilter: setFilter,
    setModalityFilter: setFilter,
  }
}
