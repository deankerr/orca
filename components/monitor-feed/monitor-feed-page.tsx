'use client'

import { parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs'

import { ModelCombobox } from '@/components/shared/or-entity-combobox'
import { Field, FieldLabel } from '@/components/ui/field'

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Separator } from '../ui/separator'
import { EntityTypeFilter, useMonitorFeed } from './use-monitor-feed'
import { VirtualizedFeed } from './virtualized-feed'

export function MonitorFeed() {
  const [filters, setFilters] = useQueryStates(
    {
      model: parseAsString.withDefault(''),
      type: parseAsStringEnum<EntityTypeFilter>(['model', 'endpoint', '']).withDefault(''),
    },
    { history: 'push', shallow: true },
  )

  const modelSlug = filters.model
  const entityType = filters.type
  const setModelSlug = (value: string) => setFilters({ model: value })
  const setEntityType = (value: EntityTypeFilter) => setFilters({ type: value })
  const { items, loadMore, hasNextPage, isFetchingNextPage, isLoading } = useMonitorFeed(
    entityType,
    modelSlug,
  )

  const hasFilters = modelSlug || entityType
  const showEmpty = !isLoading && items.length === 0

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-2 py-6 pt-4 sm:px-6">
        <div className="flex flex-wrap gap-4">
          <Field className="w-[300px]">
            <FieldLabel htmlFor="model-filter">Model</FieldLabel>
            <ModelCombobox
              id="model-filter"
              value={modelSlug}
              onValueChange={setModelSlug}
              className="w-full"
              placeholder="Select model to filter"
            />
          </Field>

          <Field className="w-40">
            <FieldLabel htmlFor="type-filter">Type</FieldLabel>
            <Select
              value={entityType ? entityType : 'all'}
              onValueChange={(value) =>
                setEntityType(value === 'all' ? '' : (value as EntityTypeFilter))
              }
            >
              <SelectTrigger id="type-filter" size="lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="model">Models</SelectItem>
                <SelectItem value="endpoint">Endpoints</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <Separator />

      {showEmpty ? (
        <Empty className="py-24">
          <EmptyHeader>
            <EmptyTitle>No changes found</EmptyTitle>
            <EmptyDescription>
              {hasFilters
                ? 'Try adjusting your filters to see more results.'
                : 'No model or endpoint changes have been recorded yet.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <VirtualizedFeed
          items={items}
          loadMore={loadMore}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
        />
      )}
    </>
  )
}
