'use client'

import { SearchXIcon } from 'lucide-react'
import { parseAsArrayOf, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { Button } from '../ui/button'
import { useEndpointFacetState } from './use-endpoint-facet-state'
import { useEndpointQueryState } from './use-endpoint-query-state'

const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

const parseAsAttributeArray = parseAsArrayOf(parseAsString).withDefault([])

export function EndpointsEmptyState() {
  const query = useEndpointQueryState()
  const facets = useEndpointFacetState()
  const [, setParams] = useQueryStates(
    {
      q: parseAsString,
      uuid: parseAsString,
      has: parseAsAttributeArray,
      not: parseAsAttributeArray,
      sort: parseAsString,
      order: parseAsStringEnum(['asc', 'desc']),
    },
    endpointGridStateOptions,
  )

  const filterCount = facets.activeAttributeCount + facets.activeModalityCount

  const resetAll = () => {
    void setParams({
      q: null,
      uuid: null,
      has: [],
      not: [],
      sort: null,
      order: null,
    })
  }

  return (
    <Empty className="border-none font-sans">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        {query.hasQuery ? (
          <>
            <EmptyTitle>No results for &ldquo;{query.query}&rdquo;</EmptyTitle>
            <EmptyDescription>
              {filterCount > 0
                ? `${filterCount} active filter${filterCount > 1 ? 's' : ''} may be narrowing results`
                : 'Try a broader query or adjust your filters'}
            </EmptyDescription>
          </>
        ) : (
          <>
            <EmptyTitle>No endpoints match your filters</EmptyTitle>
            <EmptyDescription>
              {filterCount} active filter{filterCount > 1 ? 's' : ''} returned no results
            </EmptyDescription>
          </>
        )}
      </EmptyHeader>
      <EmptyContent>
        <Button variant="secondary" size="sm" onClick={resetAll}>
          Reset
        </Button>
      </EmptyContent>
    </Empty>
  )
}
