import { api } from '@orca/backend/api'
import { compareItems, rankings, rankItem } from '@tanstack/match-sorter-utils'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CheckIcon } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import { EntityAvatar } from '@/components/shared/entity-avatar'
import {
  EntityIdentity,
  EntityIdentityContent,
  EntityIdentityName,
  EntityIdentitySlug,
} from '@/components/shared/entity-identity'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { useEntityChoices } from './use-entity-choices'

type EntityItem = {
  name: string
  id: string
}

type EntityComboboxProps = {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder: string
  emptyMessage: string
  items?: EntityItem[]
  isPending: boolean
} & Omit<React.ComponentProps<typeof Button>, 'value' | 'defaultValue'>

function EntityCombobox({
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  items,
  isPending,
  className,
  ...props
}: EntityComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const listboxId = useId()

  const filtered = useMemo(() => {
    if (items === undefined) {
      return undefined
    }

    let nextItems = search
      ? items
          .map((item) => {
            const idRank = rankItem(item.id, search, { threshold: rankings.CONTAINS })
            const nameRank = rankItem(item.name, search, { threshold: rankings.CONTAINS })
            const bestRank = idRank.rank >= nameRank.rank ? idRank : nameRank
            return { item, rank: bestRank }
          })
          .filter((rankedItem) => rankedItem.rank.passed)
          .toSorted((a, b) => compareItems(a.rank, b.rank))
          .map((rankedItem) => rankedItem.item)
      : items

    if (value) {
      const selectedIndex = nextItems.findIndex((item) => item.id === value)

      if (selectedIndex > 0) {
        const selectedItem = nextItems[selectedIndex]

        nextItems = [
          selectedItem,
          ...nextItems.slice(0, selectedIndex),
          ...nextItems.slice(selectedIndex + 1),
        ]
      }
    }

    return nextItems
  }, [items, search, value])

  const selected = items?.find((item) => item.id === value)
  const hasFilteredItems = (filtered?.length ?? 0) > 0

  const handleSelect = (item: EntityItem) => {
    onValueChange(item.id === value ? '' : item.id)
    setOpen(false)
    setSearch('')
  }

  const listContent = (() => {
    if (isPending) {
      return (
        <div className="flex p-2">
          <FilterIdentitySkeleton />
        </div>
      )
    }

    if (hasFilteredItems) {
      return (
        <VirtualizedEntityList items={filtered ?? []} selectedId={value} onSelect={handleSelect} />
      )
    }

    return <div className="p-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            aria-expanded={open}
            aria-controls={listboxId}
            className={cn('text-left', className)}
            size="lg"
            {...props}
          />
        }
      >
        {selected ? (
          <FilterIdentity name={selected.name} id={selected.id} />
        ) : value && isPending ? (
          <FilterIdentitySkeleton />
        ) : (
          <span className="w-full truncate text-muted-foreground">{value || placeholder}</span>
        )}
      </PopoverTrigger>

      <PopoverContent className="w-[300px] overflow-hidden p-0" align="start">
        <div id={listboxId} className="flex flex-col">
          {/* Search input */}
          <div className="overflow-hidden border-b">
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              className="rounded-b-none border-0 dark:bg-transparent"
              autoFocus
            />
          </div>

          {/* Virtualized list */}
          {listContent}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ModelCombobox({
  placeholder = 'Filter by model...',
  ...props
}: Omit<EntityComboboxProps, 'items' | 'isPending' | 'searchPlaceholder' | 'emptyMessage'>) {
  const { results: models, status } = useEntityChoices(api.alerts.monitor.query.models, {})

  return (
    <EntityCombobox
      {...props}
      placeholder={placeholder}
      searchPlaceholder="Search models..."
      emptyMessage="No models found."
      items={models}
      isPending={status === 'LoadingFirstPage'}
    />
  )
}

export function ProviderCombobox({
  placeholder = 'Filter by provider...',
  ...props
}: Omit<EntityComboboxProps, 'items' | 'isPending' | 'searchPlaceholder' | 'emptyMessage'>) {
  const { results: providers, status } = useEntityChoices(api.alerts.monitor.query.providers, {})

  return (
    <EntityCombobox
      {...props}
      placeholder={placeholder}
      searchPlaceholder="Search providers..."
      emptyMessage="No providers found."
      items={providers}
      isPending={status === 'LoadingFirstPage'}
    />
  )
}

function FilterIdentity({ name, id }: { name?: string; id: string }) {
  return (
    <EntityIdentity className="flex-1">
      <EntityAvatar slug={id} />
      <EntityIdentityContent>
        <EntityIdentityName>{name}</EntityIdentityName>
        <EntityIdentitySlug>{id}</EntityIdentitySlug>
      </EntityIdentityContent>
    </EntityIdentity>
  )
}

function FilterIdentitySkeleton() {
  return (
    <EntityIdentity aria-hidden="true" className="flex-1 animate-pulse">
      <span data-slot="entity-avatar" className="shrink-0 rounded-sm bg-muted" />
      <EntityIdentityContent className="gap-1">
        <EntityIdentityName className="h-3 w-24 rounded-md bg-muted empty:block" />
        <EntityIdentitySlug className="h-3 w-36 rounded-md bg-muted" />
      </EntityIdentityContent>
    </EntityIdentity>
  )
}

function VirtualizedEntityList({
  items,
  selectedId,
  onSelect,
}: {
  items: EntityItem[]
  selectedId?: string
  onSelect: (item: EntityItem) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)

  // oxlint-disable-next-line react-hooks-js/incompatible-library -- TanStack Virtual owns mutable measurement state.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 42,
    overscan: 5,
  })

  return (
    <ScrollArea viewportRef={viewportRef} className="h-[300px]">
      <div className="relative py-1" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]
          const isSelected = item.id === selectedId

          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                'absolute right-0 left-0 mx-1 flex cursor-pointer items-center justify-between rounded-xs px-2 text-left hover:bg-accent/70',
              )}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => {
                onSelect(item)
              }}
            >
              <FilterIdentity name={item.name} id={item.id} />
              {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" />}
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
