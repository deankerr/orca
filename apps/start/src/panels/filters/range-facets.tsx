import { Button } from '@orca/ui/components/button'
import { ToggleGroup, ToggleGroupItem } from '@orca/ui/components/toggle-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { RELEASE_WINDOWS } from '#endpoints/filtering'
import type { ReleaseWindow } from '#endpoints/filtering'
import { useBound, useReleased, useScopeActions, useRangeHistograms } from '#endpoints/hooks'
import type { ScopeFilters } from '#endpoints/scope'

import { barKeyAction } from './bar-keys'
import {
  BOUND_DIRECTIONS,
  boundStops,
  histogramBars,
  keptCount,
  nearestStopIndex,
  pressedBound,
} from './bars'
import { formatBound, formatMonths, formatReleaseWindow } from './bound-labels'
import type { BoundFacet } from './bound-labels'
import { FACET_COUNT_CLASS, Facet } from './facet'

export const BOUND_ROWS: { facet: BoundFacet; label: string }[] = [
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

/** A bar's name, as a screen reader reads its radio: `≤ $0.50, 412 endpoints`. */
function barName(facet: BoundFacet, stop: number | undefined, kept: number): string {
  return `${stop === undefined ? 'any' : formatBound(facet, stop)}, ${kept} ${kept === 1 ? 'endpoint' : 'endpoints'}`
}

/**
 * A bound over a histogram of the endpoints that match every other facet. Each bar is a threshold to
 * choose: pointing at a bar previews the bound pressing it would set, lighting the bars it keeps and
 * showing its value beside the label, and pressing sets it. Pressing the bar the bound sits on clears
 * it, so hovering that bar previews "any".
 *
 * It is a radio group rather than a slider. A slider's value is continuous and its gesture is a drag,
 * whose intermediate values the URL and history would have to absorb; here every change is one press,
 * one history entry, and the preview does what dragging did, showing the result before it happens. The
 * bars are one tab stop, a roving one on the bar the bound sits on. Arrows, Home, and End move focus
 * and the preview without changing the bound, and Enter or Space press, as in a radio group inside a
 * toolbar, so stepping across ten bars leaves no trail of history (`barKeyAction`).
 *
 * A bound from the URL between thresholds checks no radio; its nearest bar takes the tab stop, and
 * pressing any bar sets that bar's exact threshold.
 */
function HistogramRow({ facet, label }: { facet: BoundFacet; label: string }) {
  const histogram = useRangeHistograms()[facet]
  const bound = useBound(facet)
  const { update } = useScopeActions()
  const direction = BOUND_DIRECTIONS[facet]
  const stops = boundStops(histogram.thresholds, direction)
  const labelId = `range-${facet}`
  const noteId = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [hovered, setHovered] = useState<number | undefined>(undefined)
  // The bar the keyboard previews, until a press, Esc, or focus leaving the row drops it.
  const [cursor, setCursor] = useState<number | undefined>(undefined)

  const home = nearestStopIndex(stops, bound)
  const previewed = hovered ?? cursor
  const preview = previewed === undefined ? undefined : pressedBound(stops[previewed], bound)
  const shown = previewed === undefined ? bound : preview
  const bars = histogramBars(histogram, direction, shown)

  const note =
    histogram.missing > 0
      ? `${histogram.missing} endpoints have no value and never match a bound`
      : undefined

  // Sets the bound and keeps focus, if the row has it, on the bar that now holds the tab stop.
  const commit = (next: number | undefined) => {
    setCursor(undefined)

    if (next !== bound) {
      update(() => ({ [facet]: next }))
    }

    if (buttons.current.some((button) => button === document.activeElement)) {
      buttons.current[stops.indexOf(next)]?.focus()
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = barKeyAction(event.key, {
      bounded: bound !== undefined,
      count: stops.length,
      cursor,
      home,
      hovered,
    })

    if (action === undefined) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    // Every key action ends the pointer's preview; a cancel ends the keyboard's too.
    setHovered(undefined)

    if (action.kind === 'preview') {
      setCursor(action.index)
      buttons.current[action.index]?.focus()
    } else if (action.kind === 'press') {
      commit(pressedBound(stops[action.index], bound))
    } else if (action.kind === 'cancel') {
      setCursor(undefined)
      buttons.current[home]?.focus()
    } else {
      commit(undefined)
    }
  }

  /** A bar the bound or preview keeps; bars light up while a preview shows what a press would keep. */
  const keptClass = previewed === undefined ? 'bg-foreground/70' : 'bg-foreground'

  const heading =
    note === undefined ? (
      <span id={labelId}>{label}</span>
    ) : (
      <>
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="cursor-help underline decoration-muted-foreground/50 decoration-dotted underline-offset-2"
                id={labelId}
              />
            }
          >
            {label}
          </TooltipTrigger>
          <TooltipContent>{note}</TooltipContent>
        </Tooltip>
        <span hidden id={noteId}>
          {note}
        </span>
      </>
    )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between text-[13px] leading-4">
        {heading}
        {previewed === undefined ? (
          <BoundValue
            clear={() => {
              commit(undefined)
            }}
            label={label}
            text={bound === undefined ? undefined : formatBound(facet, bound)}
          />
        ) : (
          <span className={cn(FACET_COUNT_CLASS, preview !== undefined && 'text-foreground')}>
            {preview === undefined ? 'any' : formatBound(facet, preview)}
          </span>
        )}
      </div>
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- Focus roves among the radios; the group itself is no tab stop. */}
      <div
        aria-describedby={note === undefined ? undefined : noteId}
        aria-labelledby={labelId}
        className="flex h-7 items-stretch rounded-sm border-b border-border has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setCursor(undefined)
          }
        }}
        onKeyDown={onKeyDown}
        onPointerLeave={() => {
          setHovered(undefined)
        }}
        role="radiogroup"
      >
        {bars.map(({ share, stop, within }, index) => (
          <button
            aria-checked={stop === bound}
            aria-label={barName(facet, stop, keptCount(histogram, direction, stop))}
            // The bars abut, each with a pixel of padding either side, so the pointer never falls between
            // two of them and re-enters the bar it has just pressed.
            className="flex flex-1 cursor-pointer items-end rounded-t-[2px] px-px outline-none hover:bg-muted focus-visible:bg-muted"
            key={index}
            onClick={() => {
              // The pointer is still on the pressed bar, which now previews clearing the bound
              // again; the preview returns when the pointer moves to another bar.
              setHovered(undefined)
              commit(pressedBound(stop, bound))
            }}
            onPointerEnter={() => {
              setHovered(index)
            }}
            ref={(button) => {
              buttons.current[index] = button
            }}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A native radio checks on arrow keys and cannot be pressed again to clear.
            role="radio"
            tabIndex={index === (cursor ?? home) ? 0 : -1}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn(
                'min-h-px w-full rounded-[1px] transition-colors duration-75',
                within ? keptClass : 'bg-foreground/20',
              )}
              style={{ height: `${share * 100}%` }}
            />
          </button>
        ))}
      </div>
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
function ReleasedRow({ released }: { released: ScopeFilters['released'] }) {
  const { update } = useScopeActions()
  const labelId = 'range-released'

  return (
    <div className="flex flex-col gap-1.5">
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
  const released = useReleased()

  return (
    <TooltipProvider delay={250}>
      <Facet title="Price and speed">
        <div className="flex flex-col gap-3.5 pt-1 pb-1">
          {BOUND_ROWS.map(({ facet, label }) => (
            <HistogramRow facet={facet} key={facet} label={label} />
          ))}
          <ReleasedRow released={released} />
        </div>
      </Facet>
    </TooltipProvider>
  )
}
