import { convexQuery } from '@convex-dev/react-query'
import { useControllableState } from '@radix-ui/react-use-controllable-state'
import { compareItems, rankings, rankItem } from '@tanstack/match-sorter-utils'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CheckIcon } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '@/convex/_generated/api'
import { cn } from '@/lib/utils'

import { EntityBadge, EntityBadgeSkeleton } from './entity-badge'

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
    if (!items) return undefined

    const seenSlugs = new Set<string>()
    return items.filter((item) => {
      if (seenSlugs.has(item.slug)) return false
      seenSlugs.add(item.slug)
      return true
    })
  }, [items])

  const filtered = useMemo(() => {
    if (!dedupedItems) return undefined

    let result: EntityItem[]

    if (!search) {
      result = dedupedItems
    } else {
      result = dedupedItems
        .map((item) => {
          const slugRank = rankItem(item.slug, search, { threshold: rankings.CONTAINS })
          const nameRank = rankItem(item.name, search, { threshold: rankings.CONTAINS })
          const bestRank = slugRank.rank >= nameRank.rank ? slugRank : nameRank
          return { item, rank: bestRank }
        })
        .filter((result) => result.rank.passed)
        .sort((a, b) => compareItems(a.rank, b.rank))
        .map((result) => result.item)
    }

    if (value) {
      const selectedIndex = result.findIndex((item) => item.slug === value)
      if (selectedIndex > 0) {
        const selectedItem = result[selectedIndex]
        result = [
          selectedItem,
          ...result.slice(0, selectedIndex),
          ...result.slice(selectedIndex + 1),
        ]
      }
    }

    return result
  }, [dedupedItems, search, value])

  const selected = dedupedItems?.find((item) => item.slug === value)

  const handleSelect = (item: EntityItem) => {
    setValue(item.slug === value ? '' : item.slug)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-expanded={open}
        aria-controls={listboxId}
        render={
          <Button
            variant="outline"
            role="combobox"
            className={cn('text-left', className)}
            size="lg"
            {...props}
          />
        }
      >
        <>
          {selected ? (
            <EntityBadge
              name={selected.name}
              slug={selected.slug}
              clickToCopy={false}
              className="flex-1"
            />
          ) : value && isPending ? (
            <EntityBadgeSkeleton className="flex-1" />
          ) : (
            <span className="w-full text-muted-foreground">{placeholder}</span>
          )}
        </>
      </PopoverTrigger>

      <PopoverContent className="w-[300px] overflow-hidden p-0" align="start">
        <div id={listboxId} className="flex flex-col">
          {/* Search input */}
          <div className="overflow-hidden border-b">
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-b-none border-0 dark:bg-transparent"
              autoFocus
            />
          </div>

          {/* Virtualized list */}
          {isPending ? (
            <div className="flex p-2">
              <EntityBadgeSkeleton className="flex-1" />
            </div>
          ) : !filtered?.length ? (
            <div className="p-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            <VirtualizedEntityList items={filtered} selectedSlug={value} onSelect={handleSelect} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ModelCombobox({
  placeholder = 'Filter by model...',
  ...props
}: Omit<EntityComboboxProps, 'items' | 'isPending' | 'searchPlaceholder' | 'emptyMessage'>) {
  const { data: models, isPending } = useQuery(convexQuery(api.models.list, {}))

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
  const scrollRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 42,
    overscan: 5,
  })

  return (
    <div ref={scrollRef} className="h-[300px] overflow-y-auto">
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
              onClick={() => onSelect(item)}
            >
              <EntityBadge
                name={item.name}
                slug={item.slug}
                clickToCopy={false}
                className="flex-1"
              />
              {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
