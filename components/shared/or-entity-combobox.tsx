import { useMemo, useRef, useState } from 'react'

import { convexQuery } from '@convex-dev/react-query'
import { useControllableState } from '@radix-ui/react-use-controllable-state'
import { compareItems, rankings, rankItem } from '@tanstack/match-sorter-utils'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CheckIcon } from 'lucide-react'

import { api } from '@/convex/_generated/api'
import { Doc } from '@/convex/_generated/dataModel'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { EntityBadge, EntityBadgeSkeleton } from './entity-badge'

export function ModelCombobox({
  value: valueProp,
  defaultValue,
  onValueChange,
  placeholder = 'Filter by model...',
  className,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? '',
    onChange: onValueChange,
  })

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data: models, isPending } = useQuery(convexQuery(api.models.list, {}))

  // * Fuzzy filter + rank models by search
  const filtered = useMemo(() => {
    if (!models) return undefined
    if (!search) return models

    return models
      .map((m) => {
        // Rank against both slug and name, take the better match
        const slugRank = rankItem(m.slug, search, { threshold: rankings.CONTAINS })
        const nameRank = rankItem(m.name, search, { threshold: rankings.CONTAINS })
        const bestRank = slugRank.rank >= nameRank.rank ? slugRank : nameRank
        return { model: m, rank: bestRank }
      })
      .filter((item) => item.rank.passed)
      .sort((a, b) => compareItems(a.rank, b.rank))
      .map((item) => item.model)
  }, [models, search])

  const selected = models?.find((m) => m.slug === value)

  const handleSelect = (model: Doc<'or_views_models'>) => {
    // Toggle off if already selected
    setValue(model.slug === value ? '' : model.slug)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('h-10 w-[300px] justify-between font-normal', className)}
        >
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
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[300px] overflow-hidden p-0" align="start">
        <div className="flex flex-col">
          {/* Search input */}
          <div className="overflow-hidden border-b">
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-b-none border-0 focus-visible:ring-1 focus-visible:ring-inset dark:bg-transparent"
              autoFocus
            />
          </div>

          {/* Virtualized list */}
          {isPending ? (
            <div className="flex p-2">
              <EntityBadgeSkeleton className="flex-1" />
            </div>
          ) : !filtered?.length ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No models found.</div>
          ) : (
            <VirtualizedModelList models={filtered} selectedSlug={value} onSelect={handleSelect} />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function VirtualizedModelList({
  models,
  selectedSlug,
  onSelect,
}: {
  models: Doc<'or_views_models'>[]
  selectedSlug?: string
  onSelect: (model: Doc<'or_views_models'>) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: models.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 5,
  })

  return (
    <ScrollArea className="h-[300px] p-1" viewportRef={scrollRef}>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const model = models[virtualRow.index]
          const isSelected = model.slug === selectedSlug

          return (
            <button
              key={model._id}
              type="button"
              className={cn(
                'absolute right-0 left-0 flex cursor-pointer items-center justify-between rounded-xs px-2 text-left hover:bg-accent/70',
              )}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onSelect(model)}
            >
              <EntityBadge
                name={model.name}
                slug={model.slug}
                clickToCopy={false}
                className="flex-1"
              />
              {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" />}
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}
