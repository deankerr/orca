import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useControllableState } from '@radix-ui/react-use-controllable-state'
import { compareItems, rankings, rankItem } from '@tanstack/match-sorter-utils'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CheckIcon } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { EntityIdentity, EntityIdentitySkeleton } from './entity-identity'

type EntityItem = {
  name: string
  slug: string
}

type EntityComboboxProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder: string
  emptyMessage: string
  items?: EntityItem[]
  isPending: boolean
} & React.ComponentProps<typeof Button>

function EntityCombobox({
  value: valueProp,
  defaultValue,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  items,
  isPending,
  className,
  ...props
}: EntityComboboxProps) {
  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? '',
    onChange: onValueChange,
  })

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const listboxId = useId()

  const dedupedItems = useMemo(() => {
    if (items === undefined) {
      return undefined
    }

    const seenSlugs = new Set<string>()
    return items.filter((item) => {
      if (seenSlugs.has(item.slug)) {
        return false
      }
      seenSlugs.add(item.slug)
      return true
    })
  }, [items])

  const filtered = useMemo(() => {
    if (dedupedItems === undefined) {
      return undefined
    }

    let nextItems = search
      ? dedupedItems
          .map((item) => {
            const slugRank = rankItem(item.slug, search, { threshold: rankings.CONTAINS })
            const nameRank = rankItem(item.name, search, { threshold: rankings.CONTAINS })
            const bestRank = slugRank.rank >= nameRank.rank ? slugRank : nameRank
            return { item, rank: bestRank }
          })
          .filter((rankedItem) => rankedItem.rank.passed)
          .toSorted((a, b) => compareItems(a.rank, b.rank))
          .map((rankedItem) => rankedItem.item)
      : dedupedItems

    if (value) {
      const selectedIndex = nextItems.findIndex((item) => item.slug === value)
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
  }, [dedupedItems, search, value])

  const selected = dedupedItems?.find((item) => item.slug === value)
  const hasFilteredItems = (filtered?.length ?? 0) > 0

  const handleSelect = (item: EntityItem) => {
    setValue(item.slug === value ? '' : item.slug)
    setOpen(false)
    setSearch('')
  }

  const listContent = (() => {
    if (isPending) {
      return (
        <div className="flex p-2">
          <EntityIdentitySkeleton className="flex-1" />
        </div>
      )
    }

    if (hasFilteredItems) {
      return (
        <VirtualizedEntityList
          items={filtered ?? []}
          selectedSlug={value}
          onSelect={handleSelect}
        />
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
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            className={cn('text-left', className)}
            size="lg"
            {...props}
          />
        }
      >
        {selected ? (
          <EntityIdentity name={selected.name} slug={selected.slug} className="flex-1" />
        ) : value && isPending ? (
          <EntityIdentitySkeleton className="flex-1" />
        ) : (
          <span className="w-full text-muted-foreground">{placeholder}</span>
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
  const { data: models, isPending } = useQuery(
    convexQuery(api.models.list, { requireTextOutput: true }),
  )

  return (
    <EntityCombobox
      {...props}
      placeholder={placeholder}
      searchPlaceholder="Search models..."
      emptyMessage="No models found."
      items={models}
      isPending={isPending}
    />
  )
}

export function ProviderCombobox({
  placeholder = 'Filter by provider...',
  ...props
}: Omit<EntityComboboxProps, 'items' | 'isPending' | 'searchPlaceholder' | 'emptyMessage'>) {
  const { data: providers, isPending } = useQuery(convexQuery(api.providers.list, {}))

  return (
    <EntityCombobox
      {...props}
      placeholder={placeholder}
      searchPlaceholder="Search providers..."
      emptyMessage="No providers found."
      items={providers}
      isPending={isPending}
    />
  )
}

function VirtualizedEntityList({
  items,
  selectedSlug,
  onSelect,
}: {
  items: EntityItem[]
  selectedSlug?: string
  onSelect: (item: EntityItem) => void
}) {
  'use no memo'
  const viewportRef = useRef<HTMLDivElement>(null)

  // oxlint-disable-next-line react-hooks-js/incompatible-library
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
          const isSelected = item.slug === selectedSlug

          return (
            <button
              key={item.slug}
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
              <EntityIdentity name={item.name} slug={item.slug} className="flex-1" />
              {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" />}
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
