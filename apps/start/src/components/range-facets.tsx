import { Button } from '@orca/ui/components/button'
import { Slider, SliderControl, SliderThumb } from '@orca/ui/components/slider'
import { ToggleGroup, ToggleGroupItem } from '@orca/ui/components/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { useId, useRef } from 'react'

import { FACET_COUNT_CLASS, Facet } from '#components/facet'
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
  stopIndexAt,
} from '#features/filters/bars'
import { formatBound, formatMonths, formatReleaseWindow } from '#features/filters/format'
import type { BoundFacet } from '#features/filters/format'
import { advanceGesture, pressShownStop, startGesture } from '#features/filters/gesture'
import type { BoundGesture, GestureStep } from '#features/filters/gesture'

const BOUND_ROWS: { facet: BoundFacet; label: string }[] = [
  { facet: 'maxInput', label: 'Input $/M' },
  { facet: 'minTps', label: 'Tok/s' },
  { facet: 'minContext', label: 'Context' },
]

/** The gap between histogram bars, in px; the thumb's width depends on it. */
const BAR_GAP = 2

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
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Clear ${label} bound, ${text}`}
            className="h-auto rounded-sm border-0 px-0 font-mono text-xs leading-4 font-normal text-foreground tabular-nums"
            onClick={clear}
            variant="link"
          />
        }
      >
        {text}
      </TooltipTrigger>
      <TooltipContent>Clear</TooltipContent>
    </Tooltip>
  )
}

/**
 * A bound over a histogram of the endpoints that match every other facet. Pressing or dragging along
 * the bars sets the bound at the bar's threshold; arrows step the bound through the thresholds, Home
 * and End jump to the ends of the range.
 *
 * The bars are the control of a Slider whose value is a stop index, one stop per bar (`boundStops`),
 * with "any" the stop at the open end. The thumb is as wide as one bar and the slider is inset, so the
 * pointer maps to a stop exactly as it maps to a bar: the bar under the pointer is the stop it sets.
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
  const noteId = useId()
  const gesture = useRef<BoundGesture | undefined>(undefined)

  const note =
    histogram.missing > 0
      ? `${histogram.missing} endpoints have no value and never match a bound`
      : undefined

  const setBound = (next: number | undefined, replace: boolean) => {
    if (next !== bound) {
      update(() => ({ [facet]: next }), { replace })
    }
  }

  const shown = nearestStopIndex(stops, bound)

  // Writes a gesture step's change to the URL.
  const apply = ({ change, gesture: next }: GestureStep) => {
    gesture.current = next

    if (change !== undefined) {
      update(() => ({ [facet]: change.value }), { replace: change.replace })
    }
  }

  const control = (
    <SliderControl
      className="h-6 cursor-pointer items-end rounded-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
      // A press and its drag are one history entry: the first change pushes, the rest replace. A press
      // on the stop the slider already shows reports no change, so when the bound sits off that stop's
      // threshold the press sets the threshold itself, here, before the slider sees the press.
      onPointerDownCapture={(event) => {
        gesture.current = undefined

        if (event.button === 0) {
          const { left, width } = event.currentTarget.getBoundingClientRect()
          const pressed = stopIndexAt(event.clientX - left, width, bars.length, BAR_GAP)

          apply(pressShownStop(startGesture(bound), stops, shown, pressed))
        }
      }}
      style={{ gap: BAR_GAP }}
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
      <SliderThumb
        aria-describedby={note === undefined ? undefined : noteId}
        aria-valuetext={text ?? 'any'}
        className="h-full"
        style={{ width: `calc((100% - ${(bars.length - 1) * BAR_GAP}px) / ${bars.length})` }}
      >
        {bound !== undefined && (
          // A line in the gap at the threshold the bound sits on.
          <span
            aria-hidden="true"
            className={cn(
              'absolute -inset-y-0.5 w-0.5 rounded-full bg-foreground',
              direction === 'min' ? '-left-0.5' : '-right-0.5',
            )}
          />
        )}
      </SliderThumb>
    </SliderControl>
  )

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
      <Slider
        aria-labelledby={labelId}
        max={stops.length - 1}
        min={0}
        onValueChange={(index, { reason }) => {
          const next = stops[index]

          if (reason !== 'track-press' && reason !== 'drag') {
            setBound(next, true)

            return
          }

          // The slider compares each change with its own, controlled value, which trails the URL by a
          // render. A drag that returns to its starting stop within that render is dropped, and the
          // bound stays at the stop it last reached.
          apply(advanceGesture(gesture.current ?? startGesture(bound), next))
        }}
        onValueCommitted={() => {
          gesture.current = undefined
        }}
        value={shown}
      >
        {note === undefined ? (
          control
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger render={control} />
              <TooltipContent>{note}</TooltipContent>
            </Tooltip>
            <span hidden id={noteId}>
              {note}
            </span>
          </>
        )}
      </Slider>
    </div>
  )
}

/** One release window in the segmented control, with its hint on hover and focus. */
function ReleaseWindowItem({ window }: { window: ReleaseWindow }) {
  const hintId = useId()
  const hint = `Models released in the last ${formatMonths(window)}`

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem
              aria-describedby={hintId}
              className="h-5 min-w-0 grow rounded-sm px-0 font-mono text-xs leading-4 font-normal text-muted-foreground tabular-nums hover:bg-transparent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:bg-muted aria-pressed:text-foreground"
              value={String(window)}
            />
          }
        >
          {formatMonths(window)}
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
      <span hidden id={hintId}>
        {hint}
      </span>
    </>
  )
}

/** Release windows as a segmented control: pressing the active window clears it. */
function ReleasedRow({ released }: { released: EndpointFilters['released'] }) {
  const { update } = useEndpointSearchActions()
  const labelId = 'range-released'

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
      <ToggleGroup
        aria-labelledby={labelId}
        className="w-full min-w-0 rounded-md border border-border p-0.5"
        onValueChange={([chosen]) => {
          update(() => ({ released: RELEASE_WINDOWS.find((window) => String(window) === chosen) }))
        }}
        spacing={0.5}
        value={released === undefined ? [] : [String(released)]}
      >
        {RELEASE_WINDOWS.map((window) => (
          <ReleaseWindowItem key={window} window={window} />
        ))}
      </ToggleGroup>
    </div>
  )
}

/** The bounds on price, speed, context, and the model's release date. */
export function RangeFacets() {
  const { released } = useEndpointSearch()

  return (
    <TooltipProvider delay={250}>
      <Facet title="Price and speed">
        {BOUND_ROWS.map(({ facet, label }) => (
          <HistogramRow facet={facet} key={facet} label={label} />
        ))}
        <ReleasedRow released={released} />
      </Facet>
    </TooltipProvider>
  )
}
