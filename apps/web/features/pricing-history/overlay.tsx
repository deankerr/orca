'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'
import { formatPrice } from '@orca/backend/numbers'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { startTransition, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { EntityAvatar } from '@/components/shared/entity-avatar'
import {
  EntityIdentity,
  EntityIdentityContent,
  EntityIdentityName,
  EntityIdentityCopySlug,
} from '@/components/shared/entity-identity'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

import { providerColor } from './colors'
import { usePricingHistory } from './context'
import { tagPrices } from './data'
import type { PricingHistory, Trace } from './data'
import { HistoryData } from './history-data'
import { preloadPricingHistoryPlot } from './preload'
import { pricingHistoryView } from './view'
import type { Meter } from './view'

const Plot = dynamic(
  async () => await import('./plot').then((module) => module.PricingHistoryPlot),
  {
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    ),
    ssr: false,
  },
)

const dateLabel = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZoneName: 'short',
    year: 'numeric',
  })

const priceLabel = (price: number) => formatPrice(price) ?? '—'

const quotedPrice = (prices: number[]) =>
  prices.length === 0
    ? '—'
    : `${priceLabel(prices[0])}${prices.length > 1 ? `–${priceLabel(prices.at(-1) ?? 0)}` : ''}`

export function PricingHistoryOverlay() {
  const { modelId, close } = usePricingHistory()
  const open = modelId !== null

  useEffect(() => {
    if (open) {
      preloadPricingHistoryPlot()
    }
  }, [open])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden overscroll-contain sm:max-w-6xl">
        {open ? (
          <>
            <Identity modelId={modelId} />
            <History key={modelId} modelId={modelId} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Identity({ modelId }: { modelId: string }) {
  const { data } = useQuery(
    convexQuery(api.products.entity_overview.models.get, { model_id: modelId }),
  )
  const name = data?.display_name

  return (
    <DialogHeader className="flex-row items-center pe-8">
      <DialogTitle className="sr-only">{name ?? modelId} · Pricing History</DialogTitle>
      <DialogDescription className="sr-only">
        Historical OpenRouter provider pricing
      </DialogDescription>
      <EntityIdentity>
        <EntityAvatar slug={modelId} />
        <EntityIdentityContent>
          <EntityIdentityName>{name}</EntityIdentityName>
          <EntityIdentityCopySlug>{modelId}</EntityIdentityCopySlug>
        </EntityIdentityContent>
      </EntityIdentity>
    </DialogHeader>
  )
}

type Preferences = {
  requestedMeter: string
  window: [number, number] | null
  preset: string
  hidden: Set<string>
}

type HistoryControls = {
  preferences: Preferences
  setPreferences: Dispatch<SetStateAction<Preferences>>
}

function History({ modelId }: { modelId: string }) {
  const [preferences, setPreferences] = useState<Preferences>({
    hidden: new Set(),
    preset: '30',
    requestedMeter: 'prompt',
    window: null,
  })

  return (
    <HistoryData modelId={modelId}>
      {(data) => (
        <LoadedHistory data={data} preferences={preferences} setPreferences={setPreferences} />
      )}
    </HistoryData>
  )
}

function LoadedHistory({
  data,
  preferences,
  setPreferences,
}: { data: PricingHistory | null } & HistoryControls) {
  const { close } = usePricingHistory()

  if (data === null || !data.endpoints.some((endpoint) => endpoint.prices.length > 0)) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No pricing history available</EmptyTitle>
          <EmptyDescription>This model has no recorded provider prices.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Content pricingHistory={data} preferences={preferences} setPreferences={setPreferences} />
    </div>
  )
}

function Content({
  pricingHistory,
  preferences,
  setPreferences,
}: {
  pricingHistory: PricingHistory
} & HistoryControls) {
  const { requestedMeter, window, preset, hidden } = preferences
  const [plotTag, setPlotTag] = useState<string | null>(null)
  const [hoveredTag, setHoveredTag] = useState<string | null>(null)
  const [focusedTag, setFocusedTag] = useState<string | null>(null)
  const [hoverAt, setHoverAt] = useState<number | null>(null)
  const activeTag = hoveredTag ?? plotTag ?? focusedTag
  const emphasis = activeTag !== null && !hidden.has(activeTag) ? activeTag : null

  const {
    available,
    meter,
    meters,
    since,
    range,
    exactScaled,
    tags,
    shownCount,
    allShown,
    visible,
    at,
  } = pricingHistoryView(pricingHistory, { hidden, hoverAt, preset, requestedMeter, window })

  const changeRange = (next: [number, number]) => {
    setPreferences((current) => ({ ...current, preset: '', window: next }))
    setHoverAt(null)
  }

  const inspect = (next: number | null) => {
    startTransition(() => {
      setHoverAt(next)
    })
  }

  const toggle = (tag: string) => {
    setPreferences((current) => {
      const next = new Set(current.hidden)

      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }

      return { ...current, hidden: next }
    })
  }

  const showAllTime = () => {
    setPreferences((current) => ({ ...current, preset: 'all' }))
    setHoverAt(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="relative h-64 shrink-0 sm:h-96">
        <Plot
          traces={visible}
          since={since}
          asOf={pricingHistory.asOf}
          range={range}
          emphasis={emphasis}
          inspectedAt={hoverAt === null ? null : at}
          onRange={changeRange}
          onEmphasis={setPlotTag}
          onInspect={inspect}
        />
        {visible.length === 0 ? (
          <ChartEmpty
            hasProviders={tags.length > 0}
            canWiden={preset !== 'all'}
            onShowAll={showAllTime}
          />
        ) : null}
      </div>
      <Toolbar
        meter={meter}
        meters={meters}
        disabled={available.length === 0}
        preset={preset}
        onMeter={(selected) => {
          setPreferences((current) => ({ ...current, requestedMeter: selected }))
        }}
        onPreset={(nextPreset) => {
          setPreferences((current) => ({ ...current, preset: nextPreset }))
          setHoverAt(null)
        }}
      />
      <Board
        at={at}
        asOf={pricingHistory.asOf}
        tags={tags}
        traces={exactScaled}
        hidden={hidden}
        emphasis={emphasis}
        shownCount={shownCount}
        allShown={allShown}
        onToggle={toggle}
        onToggleAll={() => {
          setPreferences((current) => ({
            ...current,
            hidden: allShown ? new Set(tags) : new Set(),
          }))
        }}
        onHover={setHoveredTag}
        onFocusVisible={setFocusedTag}
      />
    </div>
  )
}

function chartEmptyMessage(hasProviders: boolean, canWiden: boolean): string {
  if (hasProviders) {
    return 'Select a provider below to show its pricing history.'
  }
  return canWiden ? 'No metered prices in this period.' : 'No metered prices for this meter.'
}

function ChartEmpty({
  hasProviders,
  canWiden,
  onShowAll,
}: {
  hasProviders: boolean
  canWiden: boolean
  onShowAll: () => void
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
      aria-live="polite"
    >
      <p>{chartEmptyMessage(hasProviders, canWiden)}</p>
      {hasProviders || !canWiden ? null : (
        <Button className="pointer-events-auto" onClick={onShowAll}>
          Show all time
        </Button>
      )}
    </div>
  )
}

function Toolbar({
  meter,
  meters,
  disabled,
  preset,
  onMeter,
  onPreset,
}: {
  meter: Meter
  meters: Meter[]
  disabled: boolean
  preset: string
  onMeter: (value: string) => void
  onPreset: (value: string) => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Select
          value={meter.value}
          disabled={disabled}
          onValueChange={(value) => {
            if (value !== null) {
              onMeter(value)
            }
          }}
          items={meters}
        >
          <SelectTrigger aria-label="Pricing meter" className="min-w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {meters.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span className="font-mono text-muted-foreground">{meter.unit}</span>
      </div>
      <ToggleGroup
        aria-label="Pricing history period"
        multiple={false}
        value={preset ? [preset] : []}
        variant="outline"
        onValueChange={(values) => {
          const [value] = values

          if (value) {
            onPreset(value)
          }
        }}
      >
        {['7', '30', '90', 'all'].map((value) => (
          <ToggleGroupItem key={value} value={value} className="w-11">
            {value === 'all' ? 'All' : `${value}d`}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function Board({
  at,
  asOf,
  tags,
  traces,
  hidden,
  emphasis,
  shownCount,
  allShown,
  onToggle,
  onToggleAll,
  onHover,
  onFocusVisible,
}: {
  at: number
  asOf: number
  tags: string[]
  traces: Trace[]
  hidden: Set<string>
  emphasis: string | null
  shownCount: number
  allShown: boolean
  onToggle: (tag: string) => void
  onToggleAll: () => void
  onHover: (tag: string | null) => void
  onFocusVisible: (tag: string | null) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">Price at</span>
          <time
            dateTime={new Date(at).toISOString()}
            className="font-mono tabular-nums"
            suppressHydrationWarning
          >
            {dateLabel(at)}
          </time>
        </div>
        {tags.length > 1 ? (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground tabular-nums">
              {shownCount} of {tags.length} providers
            </span>
            <Button variant="ghost" className="w-16" onClick={onToggleAll}>
              {allShown ? 'Hide all' : 'Show all'}
            </Button>
          </div>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1 [&>[data-slot=scroll-area-viewport]]:absolute [&>[data-slot=scroll-area-viewport]]:inset-0">
        <ul
          aria-label="Providers"
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),16rem))] content-start justify-center gap-2"
        >
          {tags.map((tag) => (
            <li key={tag} className="min-w-0">
              <LegendItem
                tag={tag}
                price={quotedPrice(tagPrices(traces, tag, at, asOf))}
                hidden={hidden.has(tag)}
                highlighted={emphasis === tag}
                onToggle={() => {
                  onToggle(tag)
                }}
                onHover={onHover}
                onFocusVisible={onFocusVisible}
              />
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  )
}

function LegendItem({
  tag,
  price,
  hidden,
  highlighted,
  onToggle,
  onHover,
  onFocusVisible,
}: {
  tag: string
  price: string
  hidden: boolean
  highlighted: boolean
  onToggle: () => void
  onHover: (tag: string | null) => void
  onFocusVisible: (tag: string | null) => void
}) {
  const color = providerColor(tag)

  return (
    <Button
      type="button"
      variant="outline"
      title={tag}
      aria-pressed={!hidden}
      className={cn(
        'w-full min-w-0 justify-start bg-transparent text-start dark:bg-transparent',
        hidden && 'opacity-40',
        highlighted && 'bg-muted hover:bg-muted dark:bg-muted dark:hover:bg-muted',
      )}
      onMouseEnter={() => {
        onHover(tag)
      }}
      onMouseLeave={() => {
        onHover(null)
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) {
          onFocusVisible(tag)
        }
      }}
      onBlur={() => {
        onFocusVisible(null)
      }}
      onClick={onToggle}
    >
      <span
        className="mr-1 size-2 shrink-0 rounded-full"
        style={{
          background: hidden ? 'transparent' : color,
          outline: `1px solid ${color}`,
        }}
      />
      <span translate="no" className="min-w-0 flex-1 truncate text-start">
        {tag}
      </span>
      <span className="min-w-[7ch] shrink-0 text-end font-mono whitespace-nowrap tabular-nums">
        {price}
      </span>
    </Button>
  )
}
