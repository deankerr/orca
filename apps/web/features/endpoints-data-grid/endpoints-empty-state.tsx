'use client'

import { SearchXIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

import { useEndpointFacetState } from './attributes/use-endpoint-facet-state'
import { useEndpointQueryState } from './use-endpoint-query-state'
import { useResetEndpointGrid } from './use-reset-endpoint-grid'

export function EndpointsEmptyState() {
  const query = useEndpointQueryState()
  const facets = useEndpointFacetState()
  const resetAll = useResetEndpointGrid()

  const filterCount = facets.activeAttributeCount + facets.activeModalityCount

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
