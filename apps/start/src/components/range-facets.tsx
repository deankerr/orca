import { cn } from 'cn'
import type { KeyboardEvent, PointerEvent } from 'react'

import { FACET_COUNT_CLASS, FOCUS_RING, Facet } from '#components/facet'
import {
  useEndpointSearch,
  useEndpointSearchActions,
  useRangeHistograms,
} from '#features/endpoints/hooks'
import { RELEASE_WINDOWS } from '#features/endpoints/search'
import type { EndpointFilters, ReleaseWindow } from '#features/endpoints/search'
import {
  BOUND_DIRECTIONS,
  boundStops,
  histogramBars,
  nearestStopIndex,
  stepStop,
} from '#features/filters/bars'
import { formatBound, formatMonths, formatReleaseWindow } from '#features/filters/format'
import type { BoundFacet } from '#features/filters/format'

const BOUND_ROWS: { facet: BoundFacet; label: string }[] = [
  { facet: 'maxInput', label: 'Input $/M' },
  { facet: 'minTps', label: 'Tok/s' },
  { facet: 'minContext', label: 'Context' },
]

/** The bound shown beside a row's label: its value, which clears the bound, or "any". */
function BoundValue({
  clear,
  label,
  text,
}: {
  clear: () => void
  label: string
  text: string | undefined
}) {
  if (text === undefined) {
    return <span className={FACET_COUNT_CLASS}>any</span>
  }

  return (
    <button
      aria-label={`Clear ${label} bound, ${text}`}
      className={cn(
        'rounded-sm font-mono text-xs leading-4 text-foreground tabular-nums hover:underline',
        FOCUS_RING,
      )}
      onClick={clear}
      title="Clear"
      type="button"
    >
      {text}
    </button>
  )
}

/**
 * A bound over a histogram of the endpoints that match every other facet. Pressing or dragging along
 * the bars sets the bound at the bar's threshold. The bars are one slider for the keyboard: arrows step
 * the bound through the thresholds, Home and End jump to the ends of the range.
 */
function HistogramRow({ facet, label }: { facet: BoundFacet; label: string }) {
  const histogram = useRangeHistograms()[facet]
  const bound = useEndpointSearch()[facet]
  const { update } = useEndpointSearchActions()
  const direction = BOUND_DIRECTIONS[facet]
  const stops = boundStops(histogram.thresholds, direction)
  const bars = histogramBars(histogram, direction, bound)
  const text = bound === undefined ? undefined : formatBound(facet, bound)
  const labelId = `range-${facet}`

  const setBound = (next: number | undefined, replace: boolean) => {
    if (next !== bound) {
      update(() => ({ [facet]: next }), { replace })
    }
  }

  const barAt = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect()
    const index = Math.floor(((event.clientX - left) / width) * bars.length)

    return bars[Math.min(Math.max(index, 0), bars.length - 1)]
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const target = (): { stop: number | undefined } | undefined => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowLeft': {
          return { stop: stepStop(stops, bound, -1) }
        }

        case 'ArrowRight':
        case 'ArrowUp': {
          return { stop: stepStop(stops, bound, 1) }
        }

        case 'End': {
          return { stop: stops.at(-1) }
        }

        case 'Home': {
          return { stop: stops[0] }
        }

        default: {
          return undefined
        }
      }
    }

    const step = target()

    if (step !== undefined) {
      event.preventDefault()
      setBound(step.stop, true)
    }
  }

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex h-5 items-center justify-between text-[13px] leading-4">
        <span id={labelId}>{label}</span>
        <BoundValue
          clear={() => {
            setBound(undefined, false)
          }}
          label={label}
          text={text}
        />
      </div>
      <div
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemax={stops.length - 1}
        aria-valuemin={0}
        aria-valuenow={nearestStopIndex(stops, bound)}
        aria-valuetext={text ?? 'any'}
        className={cn(
          'flex h-6 cursor-pointer touch-none items-end gap-0.5 rounded-sm select-none',
          FOCUS_RING,
        )}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setBound(barAt(event)?.stop, false)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            setBound(barAt(event)?.stop, true)
          }
        }}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The slider is a histogram; a native range input cannot draw the bars.
        role="slider"
        tabIndex={0}
        title={
          histogram.missing > 0
            ? `${histogram.missing} endpoints have no value and never match a bound`
            : undefined
        }
      >
        {bars.map(({ share, within }, index) => (
          <div
            className={cn(
              'min-h-px flex-1 rounded-[1px]',
              within ? 'bg-foreground' : 'bg-foreground/25',
            )}
            key={index}
            style={{ height: `${share * 100}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/** Release windows as a segmented control: pressing the active window clears it. */
function ReleasedRow({ released }: { released: EndpointFilters['released'] }) {
  const { update } = useEndpointSearchActions()
  const labelId = 'range-released'

  const choose = (window: ReleaseWindow) => {
    update(() => ({ released: window === released ? undefined : window }))
  }

  return (
    <div className="flex flex-col gap-1 py-0.5">
      <div className="flex h-5 items-center justify-between text-[13px] leading-4">
        <span id={labelId}>Released</span>
        <BoundValue
          clear={() => {
            update(() => ({ released: undefined }))
          }}
          label="Released"
          text={released === undefined ? undefined : formatReleaseWindow(released)}
        />
      </div>
      <fieldset
        aria-labelledby={labelId}
        className="flex min-w-0 gap-0.5 rounded-md border border-border bg-background p-0.5"
      >
        {RELEASE_WINDOWS.map((window) => (
          <button
            aria-pressed={window === released}
            className={cn(
              'h-5 grow rounded-sm font-mono text-xs leading-4 text-muted-foreground tabular-nums hover:text-foreground',
              window === released && 'bg-muted text-foreground',
              FOCUS_RING,
            )}
            key={window}
            onClick={() => {
              choose(window)
            }}
            title={`Models released in the last ${formatMonths(window)}`}
            type="button"
          >
            {formatMonths(window)}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

/** The bounds on price, speed, context, and the model's release date. */
export function RangeFacets() {
  const { released } = useEndpointSearch()

  return (
    <Facet title="Price and speed">
      {BOUND_ROWS.map(({ facet, label }) => (
        <HistogramRow facet={facet} key={facet} label={label} />
      ))}
      <ReleasedRow released={released} />
    </Facet>
  )
}
