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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
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

/** App-level overlay that can be opened independently of an entity overview. */
export function PricingHistoryOverlay() {
  const { modelId, close } = usePricingHistory()
  const open = modelId !== null

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <SheetContent
        side="top"
        className="mx-auto max-w-[1600px] overflow-hidden border shadow-2xl data-[side=top]:top-0 data-[side=top]:h-dvh sm:rounded-lg sm:data-[side=top]:inset-x-6 sm:data-[side=top]:top-6 sm:data-[side=top]:h-[calc(100dvh-3rem)]"
        aria-describedby={undefined}
      >
        {open && (
          <>
            <HistoryIdentity modelId={modelId} />
            <HistoryLoader key={modelId} modelId={modelId} />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function HistoryIdentity({ modelId }: { modelId: string }) {
  const { data } = useQuery(convexQuery(api.v3.public.entityOverviews.model, { modelId }))
  const name = data?.display_name

  return (
    <div className="flex shrink-0 items-center gap-3 border-b p-4 pe-14">
      <SheetTitle className="sr-only">{name ?? modelId} · Pricing history</SheetTitle>
      <EntityIdentity slug={modelId} name={name} />
    </div>
  )
}

function HistoryLoader({ modelId }: { modelId: string }) {
  const { data, isPending, error, refetch } = useQuery(
    convexQuery(api.v3.public.pricingHistory.get, { modelId }),
  )

  if (isPending) {
    return (
      <output className="flex flex-1 items-center justify-center gap-2">
        <Spinner />
        Loading pricing history…
      </output>
    )
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3">
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
  }
  if (!data.endpoints.some((endpoint) => endpoint.prices.length > 0)) {
    return <p className="p-6">No pricing history available.</p>
  }
  return <HistoryContent history={data} />
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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="relative h-[40vh] max-h-[30rem] min-h-64 shrink-0">
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
            items={available}
          >
            <SelectTrigger aria-label="Pricing meter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {available.map((item) => (
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
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="tabular-nums">
            {dateLabel(at)}
            {pinnedAt === null ? '' : ' · Pinned'}
          </p>
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
        <div className="ms-auto flex items-center gap-3">
          <span className="text-muted-foreground">
            {shownCount} of {tags.length} providers
          </span>
          <Button
            variant="ghost"
            disabled={tags.length === 0}
            onClick={() => {
              setHidden(
                allShown ? new Set(history.endpoints.map((endpoint) => endpoint.tag)) : new Set(),
              )
            }}
          >
            {allShown ? 'Hide all' : 'Restore all'}
          </Button>
        </div>
      </div>
      <ul
        aria-label="Provider prices"
        className="grid min-h-32 flex-1 [scrollbar-gutter:stable] grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] content-start gap-x-5 overflow-y-auto"
      >
        {tags.map((tag) => {
          const prices = tagPrices(traces, tag, at, history.asOf)
          const scheduled = traces.some(
            (trace) =>
              trace.tag === tag &&
              trace.scheduled &&
              trace.end >= range[0] &&
              trace.start <= range[1],
          )
          return (
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Delegate hover and focus across both row buttons without making the list item another tab stop.
            <li
              key={tag}
              data-hidden={hidden.has(tag) || undefined}
              data-highlighted={emphasis === tag || undefined}
              className="group flex min-w-0 items-center gap-1 rounded-sm transition-colors duration-150 focus-within:bg-muted/50 hover:bg-muted/50 data-highlighted:bg-muted/50 motion-reduce:transition-none"
              onMouseEnter={() => {
                setHoveredTag(tag)
              }}
              onMouseLeave={() => {
                setHoveredTag(null)
              }}
              onFocusCapture={() => {
                setFocusedTag(tag)
              }}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setFocusedTag(null)
                }
              }}
            >
              <Button
                variant="ghost"
                className="min-w-0 flex-1 justify-start group-data-hidden:opacity-40 hover:bg-transparent"
                title={tag}
                aria-pressed={!hidden.has(tag)}
                onClick={() => {
                  toggle(tag)
                }}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{
                    background: hidden.has(tag) ? 'transparent' : providerColor(tag),
                    outline: `1px solid ${providerColor(tag)}`,
                  }}
                />
                <span className="truncate">{tag}</span>
              </Button>
              {scheduled && (
                <span
                  title="Scheduled pricing observed in this history"
                  aria-label="Scheduled pricing"
                >
                  ◷
                </span>
              )}
              <span className="min-w-[7ch] text-right font-mono whitespace-nowrap tabular-nums group-data-hidden:opacity-40">
                {prices.length
                  ? `${priceLabel(prices[0])}${prices.length > 1 ? `–${priceLabel(prices.at(-1) ?? 0)}` : ''}`
                  : '—'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="duration-150 motion-reduce:transition-none pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100 pointer-fine:group-data-highlighted:opacity-100"
                disabled={shownCount === 1 && !hidden.has(tag)}
                aria-label={`Show only ${tag}`}
                onClick={() => {
                  setHidden(
                    new Set(
                      history.endpoints
                        .map((endpoint) => endpoint.tag)
                        .filter((candidate) => candidate !== tag),
                    ),
                  )
                }}
              >
                Only
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
