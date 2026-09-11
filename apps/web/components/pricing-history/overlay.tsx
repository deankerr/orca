'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { formatPricing } from '@orca/backend/convex/shared/pricing'
import { useQuery } from '@tanstack/react-query'
import { ConvexError } from 'convex/values'
import dynamic from 'next/dynamic'
import { startTransition, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { EntityIdentity } from '@/components/shared/entity-identity'
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
import { DAY, dailyTrace, pricingHistoryTraces, tagPrices } from './data'
import type { PricingHistory, Trace } from './data'
import { preloadPricingHistoryPlot } from './preload'

const Plot = dynamic(
  async () => await import('./plot').then((module) => module.PricingHistoryPlot),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    ),
  },
)

const METERS = [
  { value: 'prompt', label: 'Input', scale: 1e6, unit: '$/MTOK' },
  { value: 'completion', label: 'Output', scale: 1e6, unit: '$/MTOK' },
  { value: 'input_cache_read', label: 'Cache read', scale: 1e6, unit: '$/MTOK' },
  { value: 'input_cache_write', label: 'Cache write', scale: 1e6, unit: '$/MTOK' },
  { value: 'input_cache_write_1h', label: 'Cache write · 1h', scale: 1e6, unit: '$/MTOK' },
  { value: 'audio', label: 'Audio input', scale: 1e6, unit: '$/MTOK' },
  { value: 'input_audio_cache', label: 'Audio cache', scale: 1e6, unit: '$/MTOK' },
  { value: 'image', label: 'Image input', scale: 1000, unit: '$/KTOK' },
  { value: 'image_output', label: 'Image output', scale: 1000, unit: '$/KTOK' },
]
type Meter = (typeof METERS)[number]
const dateLabel = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

const priceLabel = (price: number) => formatPricing('text_input', price / 1e6)?.value ?? '—'

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
            <Loader key={modelId} modelId={modelId} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Identity({ modelId }: { modelId: string }) {
  const { data } = useQuery(convexQuery(api.v3.public.entityOverview.model, { modelId }))
  const name = data?.display_name

  return (
    <DialogHeader className="flex-row items-center pe-8">
      <DialogTitle className="sr-only">{name ?? modelId} · Pricing History</DialogTitle>
      <DialogDescription className="sr-only">
        Historical OpenRouter provider pricing
      </DialogDescription>
      <EntityIdentity slug={modelId} name={name} />
    </DialogHeader>
  )
}

function Loader({ modelId }: { modelId: string }) {
  const { close } = usePricingHistory()

  const { data, isPending, error, refetch } = useQuery(
    convexQuery(api.v3.public.pricingHistory.get, { modelId }),
  )

  let body

  if (isPending) {
    body = (
      <output aria-live="polite" className="flex items-center justify-center gap-2 py-8">
        <Spinner />
        Loading pricing history…
      </output>
    )
  } else if (error) {
    body = (
      <div role="alert" className="flex flex-col items-center justify-center gap-3 py-8">
        <p>
          {error instanceof ConvexError && typeof error.data === 'string'
            ? error.data
            : 'Could not load pricing history.'}
        </p>
        <Button
          onClick={() => {
            refetch().catch(() => {
              /* The query error state displays retry failures. */
            })
          }}
        >
          Retry
        </Button>
      </div>
    )
  } else if (data.endpoints.some((endpoint) => endpoint.prices.length > 0)) {
    body = <Content pricingHistory={data} />
  } else {
    body = (
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

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
}

function Content({ pricingHistory }: { pricingHistory: PricingHistory }) {
  const [requestedMeter, setRequestedMeter] = useState('prompt')
  const [window, setWindow] = useState<[number, number] | null>(null)
  const [preset, setPreset] = useState('30')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [plotTag, setPlotTag] = useState<string | null>(null)
  const [hoveredTag, setHoveredTag] = useState<string | null>(null)
  const [focusedTag, setFocusedTag] = useState<string | null>(null)
  const activeTag = hoveredTag ?? plotTag ?? focusedTag
  const emphasis = activeTag !== null && !hidden.has(activeTag) ? activeTag : null
  const [hoverAt, setHoverAt] = useState<number | null>(null)

  const available = METERS.filter((meter) =>
    pricingHistory.endpoints.some((endpoint) =>
      endpoint.prices.some((price) => Number(price.meters[meter.value]) > 0),
    ),
  )

  const meter = available.find(({ value }) => value === requestedMeter) ?? available[0] ?? METERS[0]
  const meters = available.length > 0 ? available : [meter]

  const since = Math.min(
    pricingHistory.asOf,
    ...pricingHistory.endpoints.flatMap((endpoint) =>
      endpoint.listings.map((row) => Date.parse(row.scan_at)),
    ),
  )

  const range: [number, number] =
    preset === '' && window !== null
      ? window
      : [
          preset === 'all'
            ? since
            : Math.max(since, pricingHistory.asOf - Number(preset || '30') * DAY),
          pricingHistory.asOf,
        ]

  const daily = range[1] - range[0] > 7 * DAY + 1
  const exact = pricingHistoryTraces(pricingHistory, meter.value)

  const traces = exact.map((trace) => {
    const sampled = daily ? dailyTrace(trace, pricingHistory.asOf) : trace
    return {
      ...sampled,
      samples: sampled.samples.map(([at, price]): [number, number] => [at, price * meter.scale]),
    }
  })

  const tagSet = new Set<string>()
  for (const trace of traces) {
    if (trace.end >= range[0] && trace.start <= range[1]) {
      tagSet.add(trace.tag)
    }
  }
  const tags = [...tagSet].toSorted()
  const shownCount = tags.filter((tag) => !hidden.has(tag)).length
  const allShown = tags.length > 0 && shownCount === tags.length
  const visible = traces.filter((trace) => tagSet.has(trace.tag) && !hidden.has(trace.tag))
  const at = Math.max(range[0], Math.min(range[1], hoverAt ?? range[1]))

  const changeRange = (next: [number, number]) => {
    setWindow(next)
    setPreset('')
    setHoverAt(null)
  }

  const inspect = (next: number | null) => {
    startTransition(() => {
      setHoverAt(next)
    })
  }

  const toggle = (tag: string) => {
    setHidden((current) => {
      const next = new Set(current)

      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }

      return next
    })
  }

  const showAllTime = () => {
    changeRange([since, pricingHistory.asOf])
    setPreset('all')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <ChartPane
        traces={visible}
        since={since}
        asOf={pricingHistory.asOf}
        range={range}
        emphasis={emphasis}
        inspectedAt={hoverAt === null ? null : at}
        empty={
          visible.length === 0 ? (
            <ChartEmpty
              hasProviders={tags.length > 0}
              canWiden={preset !== 'all'}
              onShowAll={showAllTime}
            />
          ) : null
        }
        onRange={changeRange}
        onEmphasis={setPlotTag}
        onInspect={inspect}
      />
      <Toolbar
        meter={meter}
        meters={meters}
        disabled={available.length === 0}
        preset={preset}
        onMeter={setRequestedMeter}
        onPreset={(value) => {
          changeRange([
            value === 'all' ? since : Math.max(since, pricingHistory.asOf - Number(value) * DAY),
            pricingHistory.asOf,
          ])

          setPreset(value)
        }}
      />
      <Board
        at={at}
        asOf={pricingHistory.asOf}
        tags={tags}
        traces={traces}
        hidden={hidden}
        emphasis={emphasis}
        shownCount={shownCount}
        allShown={allShown}
        onToggle={toggle}
        onToggleAll={() => {
          setHidden(allShown ? new Set(tags) : new Set())
        }}
        onHover={setHoveredTag}
        onFocusVisible={setFocusedTag}
      />
    </div>
  )
}

function ChartPane({
  traces,
  since,
  asOf,
  range,
  emphasis,
  inspectedAt,
  empty,
  onRange,
  onEmphasis,
  onInspect,
}: {
  traces: Trace[]
  since: number
  asOf: number
  range: [number, number]
  emphasis: string | null
  inspectedAt: number | null
  empty: ReactNode
  onRange: (range: [number, number]) => void
  onEmphasis: (tag: string | null) => void
  onInspect: (at: number | null) => void
}) {
  return (
    <div className="relative h-64 shrink-0 sm:h-96">
      <Plot
        traces={traces}
        since={since}
        asOf={asOf}
        range={range}
        emphasis={emphasis}
        inspectedAt={inspectedAt}
        onRange={onRange}
        onEmphasis={onEmphasis}
        onInspect={onInspect}
      />
      {empty}
    </div>
  )
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
      <p>
        {hasProviders
          ? 'Select a provider below to show its pricing history.'
          : canWiden
            ? 'No metered prices in this period.'
            : 'No metered prices for this meter.'}
      </p>
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
