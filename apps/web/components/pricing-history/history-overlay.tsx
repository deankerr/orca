'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { formatPricing } from '@orca/backend/convex/shared/pricing'
import { useQuery } from '@tanstack/react-query'
import { ConvexError } from 'convex/values'
import dynamic from 'next/dynamic'
import { useState } from 'react'

import { EntityIdentity } from '@/components/shared/entity-identity'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
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

import { providerColor } from './colors'
import { usePricingHistory } from './history-context'
import { DAY, dailyTrace, historyTraces, tagPrices } from './history-data'
import type { History } from './history-data'

const Plot = dynamic(
  async () => await import('./history-plot').then((module) => module.HistoryPlot),
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
  { value: 'prompt', label: 'Input', scale: 1e6, unit: '$ / MTOK' },
  { value: 'completion', label: 'Output', scale: 1e6, unit: '$ / MTOK' },
  { value: 'input_cache_read', label: 'Cache read', scale: 1e6, unit: '$ / MTOK' },
  { value: 'input_cache_write', label: 'Cache write', scale: 1e6, unit: '$ / MTOK' },
  { value: 'input_cache_write_1h', label: 'Cache write · 1h', scale: 1e6, unit: '$ / MTOK' },
  { value: 'audio', label: 'Audio input', scale: 1e6, unit: '$ / MTOK' },
  { value: 'input_audio_cache', label: 'Audio cache', scale: 1e6, unit: '$ / MTOK' },
  { value: 'image', label: 'Image input', scale: 1000, unit: '$ / 1K images' },
  { value: 'image_output', label: 'Image output', scale: 1000, unit: '$ / 1K images' },
]
const dateLabel = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col overflow-hidden sm:max-w-6xl">
        {open && (
          <>
            <HistoryIdentity modelId={modelId} />
            <HistoryLoader key={modelId} modelId={modelId} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function HistoryIdentity({ modelId }: { modelId: string }) {
  const { data } = useQuery(convexQuery(api.v3.public.entityOverviews.model, { modelId }))
  const name = data?.display_name

  return (
    <DialogHeader className="flex-row items-center pe-8">
      <DialogTitle className="sr-only">{name ?? modelId} · Pricing history</DialogTitle>
      <DialogDescription className="sr-only">
        Historical OpenRouter provider pricing
      </DialogDescription>
      <EntityIdentity slug={modelId} name={name} />
    </DialogHeader>
  )
}

function HistoryLoader({ modelId }: { modelId: string }) {
  const { data, isPending, error, refetch } = useQuery(
    convexQuery(api.v3.public.pricingHistory.get, { modelId }),
  )

  let body
  if (isPending) {
    body = (
      <output className="flex items-center justify-center gap-2 py-8">
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
    body = <HistoryContent history={data} />
  } else {
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No pricing history available</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
}

function HistoryContent({ history }: { history: History }) {
  const [requestedMeter, setRequestedMeter] = useState('prompt')
  const [window, setWindow] = useState<[number, number] | null>(null)
  const [preset, setPreset] = useState('30')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [chartTag, setChartTag] = useState<string | null>(null)
  const [hoveredTag, setHoveredTag] = useState<string | null>(null)
  const [focusedTag, setFocusedTag] = useState<string | null>(null)
  const activeTag = hoveredTag ?? chartTag ?? focusedTag
  const emphasis = activeTag !== null && !hidden.has(activeTag) ? activeTag : null
  const [hoverAt, setHoverAt] = useState<number | null>(null)
  const [pinnedAt, setPinnedAt] = useState<number | null>(null)
  const available = METERS.filter((meter) =>
    history.endpoints.some((endpoint) =>
      endpoint.prices.some((price) => Number(price.meters[meter.value]) > 0),
    ),
  )
  const meter = available.find(({ value }) => value === requestedMeter) ?? available[0] ?? METERS[0]
  const meters = available.length > 0 ? available : [meter]
  const since = Math.min(
    history.asOf,
    ...history.endpoints.flatMap((endpoint) =>
      endpoint.listings.map((row) => Date.parse(row.scan_at)),
    ),
  )
  const range: [number, number] =
    preset === '' && window !== null
      ? window
      : [
          preset === 'all' ? since : Math.max(since, history.asOf - Number(preset || '30') * DAY),
          history.asOf,
        ]

  const daily = range[1] - range[0] > 7 * DAY + 1
  const exact = historyTraces(history, meter.value)
  const traces = exact.map((trace) => {
    const sampled = daily ? dailyTrace(trace, history.asOf) : trace
    return {
      ...sampled,
      samples: sampled.samples.map(([at, price]): [number, number] => [at, price * meter.scale]),
    }
  })
  const tags = [
    ...new Set(
      traces
        .filter((trace) => trace.end >= range[0] && trace.start <= range[1])
        .map((trace) => trace.tag),
    ),
  ].toSorted()
  const shownCount = tags.filter((tag) => !hidden.has(tag)).length
  const allShown = tags.length > 0 && shownCount === tags.length
  const visible = traces.filter((trace) => tags.includes(trace.tag) && !hidden.has(trace.tag))
  const at = Math.max(range[0], Math.min(range[1], pinnedAt ?? hoverAt ?? range[1]))

  const changeRange = (next: [number, number]) => {
    setWindow(next)
    setPreset('')
    setPinnedAt(null)
    setHoverAt(null)
  }
  const toggle = (tag: string) => {
    const next = new Set(hidden)
    if (next.has(tag)) {
      next.delete(tag)
    } else {
      next.add(tag)
    }
    setHidden(next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="relative h-64 shrink-0 sm:h-96">
        <Plot
          traces={visible}
          since={since}
          asOf={history.asOf}
          range={range}
          emphasis={emphasis}
          inspectedAt={hoverAt !== null || pinnedAt !== null ? at : null}
          onRange={changeRange}
          onEmphasis={setChartTag}
          onInspect={(value, pin) => {
            if (pin) {
              setPinnedAt(value)
            } else if (pinnedAt === null) {
              setHoverAt(value)
            }
          }}
        />
        {visible.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {tags.length
              ? 'Select a provider below to show its history.'
              : 'No metered prices in this period.'}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select
            value={meter.value}
            disabled={available.length === 0}
            onValueChange={(value) => {
              if (value !== null) {
                setRequestedMeter(value)
              }
            }}
            items={meters}
          >
            <SelectTrigger aria-label="Pricing meter">
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
          <span className="text-muted-foreground">{meter.unit}</span>
        </div>
        <ToggleGroup
          aria-label="History period"
          multiple={false}
          value={preset ? [preset] : []}
          variant="outline"
          onValueChange={(values) => {
            const [value] = values
            if (value) {
              changeRange([
                value === 'all' ? since : Math.max(since, history.asOf - Number(value) * DAY),
                history.asOf,
              ])
              setPreset(value)
            }
          }}
        >
          {['7', '30', '90', 'all'].map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {value === 'all' ? 'All' : `${value}d`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="tabular-nums">Prices at {dateLabel(at)}</p>
            {pinnedAt !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPinnedAt(null)
                  setHoverAt(null)
                }}
              >
                Unpin
              </Button>
            )}
          </div>
          {tags.length > 1 && (
            <div className="ms-auto flex items-center gap-3">
              <span className="text-muted-foreground">
                {shownCount} of {tags.length} providers
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  setHidden(allShown ? new Set(tags) : new Set())
                }}
              >
                {allShown ? 'Hide all' : 'Show all'}
              </Button>
            </div>
          )}
        </div>
        <ul
          aria-label="Providers"
          className="grid min-h-0 flex-1 [scrollbar-gutter:stable] grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),16rem))] content-start justify-center gap-2 overflow-y-auto"
        >
          {tags.map((tag) => (
            <li key={tag} className="min-w-0">
              <LegendItem
                tag={tag}
                price={quotedPrice(tagPrices(traces, tag, at, history.asOf))}
                hidden={hidden.has(tag)}
                highlighted={emphasis === tag}
                onToggle={() => {
                  toggle(tag)
                }}
                onHover={setHoveredTag}
                onFocusVisible={setFocusedTag}
              />
            </li>
          ))}
        </ul>
      </div>
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
  return (
    <button
      type="button"
      title={tag}
      aria-pressed={!hidden}
      data-hidden={hidden || undefined}
      data-highlighted={highlighted || undefined}
      className="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border border-input bg-transparent px-2 text-start text-xs transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 data-hidden:opacity-40 data-highlighted:bg-muted/50 motion-reduce:transition-none"
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
        className="size-2 shrink-0 rounded-full"
        style={{
          background: hidden ? 'transparent' : providerColor(tag),
          outline: `1px solid ${providerColor(tag)}`,
        }}
      />
      <span className="min-w-0 flex-1 truncate">{tag}</span>
      <span className="min-w-[7ch] shrink-0 text-end font-mono whitespace-nowrap tabular-nums">
        {price}
      </span>
    </button>
  )
}
