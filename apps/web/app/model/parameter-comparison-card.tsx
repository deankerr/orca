'use client'

import { useState } from 'react'

import { EntityIdentity } from '@/components/shared/entity-identity'
import { CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { ModelPageCard } from './model-page-card'
import type { ModelEndpoint } from './types'

// --- Layout dials ---
// 45° is the natural diagonal. Smaller angles flatten the labels and make them
// easier to read, at the cost of more horizontal space to the right. The angle
// feeds both the label rotation and the CSS-derived header height, so it stays
// consistent when tuned.
const LABEL_ANGLE_DEG = 45

// Row height mirrors the shadcn Table row used by the sibling cards on this page
// (p-2 around a size-6 avatar over a two-line provider label) so the matrix keeps
// the same vertical rhythm and feels visually stable among them.
const ROW_HEIGHT_REM = 3.0625

// Parameter columns are scaled from the row height. The square support fill is
// centred inside a slightly wider column, leaving padding on every side that
// echoes the Table's padded cells — and giving the diagonal labels room so a
// long one doesn't drift over its neighbour's column.
const COLUMN_WIDTH_REM = 2.75
const FILL_SIZE_REM = 2

// Small gap between a label's underline and the top of the column marks, so the
// two don't appear to touch. Also reserved as headroom in the header height.
const LABEL_LIFT_REM = 0.25

// Width of the leading provider column. Long names truncate within it so the
// matrix always starts at a consistent x.
const PROVIDER_COLUMN_REM = 10

// Aggregate per-parameter support so common parameters anchor the left and rare,
// routing-constraining ones (e.g. logprobs) collect on the right where the gaps
// in their columns stand out.
function buildParameterMatrix(endpoints: readonly ModelEndpoint[]) {
  const supportCounts = new Map<string, number>()

  for (const endpoint of endpoints) {
    for (const parameter of endpoint.supportedParameters) {
      supportCounts.set(parameter, (supportCounts.get(parameter) ?? 0) + 1)
    }
  }

  const parameters = [...supportCounts.keys()].toSorted(
    (left, right) =>
      (supportCounts.get(right) ?? 0) - (supportCounts.get(left) ?? 0) || left.localeCompare(right),
  )

  // Match Provider Comparison: available first, then alphabetical.
  const sortedEndpoints = [...endpoints].toSorted(
    (left, right) =>
      Number(left.unavailableAt !== undefined) - Number(right.unavailableAt !== undefined) ||
      left.providerName.localeCompare(right.providerName),
  )

  return { parameters, sortedEndpoints }
}

type MatrixHover =
  | { kind: 'row'; endpointId: string }
  | { kind: 'column'; column: number }
  | { kind: 'cell'; endpointId: string; column: number }

export function ParameterComparisonCard({ endpoints }: { endpoints: readonly ModelEndpoint[] }) {
  const { parameters, sortedEndpoints } = buildParameterMatrix(endpoints)

  // Which part of the matrix the pointer is over, so the grid can dim by
  // relevance instead of adding another background layer on top of the data.
  const [hover, setHover] = useState<MatrixHover | null>(null)
  const hoveredColumn = hover?.kind === 'column' || hover?.kind === 'cell' ? hover.column : null
  const hoveredRowId = hover?.kind === 'row' || hover?.kind === 'cell' ? hover.endpointId : null

  // The header band must clear the tallest rotated label, and the matrix needs
  // right padding so the last two labels (which overhang furthest right) don't
  // clip. Derived from raw character counts: the grid is `font-mono`, so `1ch`
  // equals one label character exactly, and sin/cos map to the chosen angle.
  let maxLabelChars = 0
  for (const parameter of parameters) {
    maxLabelChars = Math.max(maxLabelChars, parameter.length)
  }
  const lastLabelChars = parameters.at(-1)?.length ?? 0
  const secondLastLabelChars = parameters.at(-2)?.length ?? 0

  // CSS custom properties shared by the grid, header cells and labels.
  const gridStyle = {
    '--cell-w': `${COLUMN_WIDTH_REM}rem`,
    '--row-h': `${ROW_HEIGHT_REM}rem`,
    '--fill': `${FILL_SIZE_REM}rem`,
    '--label-angle': `${LABEL_ANGLE_DEG}deg`,
    '--label-lift': `${LABEL_LIFT_REM}rem`,
    '--max-label-ch': maxLabelChars,
    '--last-label-ch': lastLabelChars,
    '--second-last-label-ch': secondLastLabelChars,
    // Rotated label height = baseline length (chars·ch·sin) + the line's own
    // height projected onto the vertical (1lh·cos); without the latter the
    // tallest labels clip. Plus the lift twice: a gap below the label and equal
    // headroom above it so the tip clears the scroll container.
    '--header-h':
      'max(4rem, calc(var(--max-label-ch) * 1ch * sin(var(--label-angle)) + 1lh * cos(var(--label-angle)) + var(--label-lift) * 2))',
    gridTemplateColumns: `${PROVIDER_COLUMN_REM}rem repeat(${parameters.length}, var(--cell-w))`,
    // Each label is anchored at its column centre and rises right, so its tip
    // clears the grid edge by (length·cos − distance from that centre to the
    // edge). The last column already has half a column of slack to the edge, the
    // second-last one-and-a-half; pad by whichever overhangs more so a long
    // second-last before a short last (e.g. …repetition_penalty, stop) can't clip.
    paddingRight:
      'max(0px, calc(var(--last-label-ch) * 1ch * cos(var(--label-angle)) - var(--cell-w) / 2), calc(var(--second-last-label-ch) * 1ch * cos(var(--label-angle)) - var(--cell-w) * 1.5))',
  } as React.CSSProperties

  return (
    <ModelPageCard title="Parameter Comparison" className="pb-0">
      <CardContent className="grid gap-3">
        <div className="flex items-start justify-between gap-6 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1">
            Parameter support varies by provider. Rare parameters constrain which providers can
            serve a request.
          </p>
          <div className="flex shrink-0 items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] border border-foreground/15 bg-foreground/25" />
              supported
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] border border-border/70 bg-transparent" />
              not supported
            </span>
          </div>
        </div>

        {parameters.length === 0 ? (
          <div className="mb-4 rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
            No provider parameters reported.
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-4">
            {/* Full-bleed scroll: break out of CardContent's padding with -mx-4 and
                re-apply it inside, so the matrix scrolls to the card edge and the
                horizontal scrollbar sits below the last row (pb-4) rather than over it.
                The matrix itself is one grid; each row is a subgrid so columns align
                automatically and rows stay real DOM elements for a11y. */}
            <div
              role="table"
              className="grid w-max font-mono text-sm"
              style={gridStyle}
              onMouseLeave={() => {
                setHover(null)
              }}
            >
              {/* Header band: quiet corner + diagonal parameter labels. */}
              <div role="row" className="col-span-full grid grid-cols-subgrid">
                <div
                  className="flex items-end pr-3 pb-1 font-sans text-xs text-muted-foreground"
                  style={{ minHeight: 'var(--header-h)' }}
                >
                  Provider
                </div>
                {parameters.map((parameter, index) => (
                  <div
                    key={parameter}
                    role="columnheader"
                    className="relative"
                    style={{ minHeight: 'var(--header-h)' }}
                    onMouseEnter={() => {
                      setHover({ kind: 'column', column: index })
                    }}
                  >
                    {/* The underline doubles as a leader: it hugs the text and
                        runs down the label's own diagonal, with its bottom-left
                        corner rooted at the column centre (above the fill), so a
                        label can be traced back to its cell even when a long one
                        sits before a short one. The active label brightens while
                        neighbouring labels step back. */}
                    <span
                      className={cn(
                        'absolute left-1/2 origin-bottom-left whitespace-nowrap underline decoration-1 underline-offset-2',
                        hoveredColumn === index
                          ? 'text-foreground decoration-foreground/70'
                          : 'text-muted-foreground decoration-border/70',
                        hoveredColumn !== null && hoveredColumn !== index && 'opacity-45',
                      )}
                      style={{
                        bottom: 'var(--label-lift)',
                        transform: 'rotate(calc(-1 * var(--label-angle)))',
                      }}
                    >
                      {parameter}
                    </span>
                  </div>
                ))}
              </div>

              {sortedEndpoints.map((endpoint) => {
                const supported = new Set(endpoint.supportedParameters)
                const isUnavailable = endpoint.unavailableAt !== undefined
                const isHoveredRow = hoveredRowId === endpoint.id

                return (
                  <div
                    key={endpoint.id}
                    role="row"
                    style={{ minHeight: 'var(--row-h)' }}
                    className={cn(
                      'col-span-full grid grid-cols-subgrid rounded-[3px]',
                      isUnavailable && 'opacity-40',
                    )}
                  >
                    <div
                      role="rowheader"
                      className={cn(
                        'flex min-w-0 items-center pr-3',
                        hoveredRowId !== null && !isHoveredRow && 'opacity-50',
                      )}
                      onMouseEnter={() => {
                        setHover({ kind: 'row', endpointId: endpoint.id })
                      }}
                    >
                      <EntityIdentity
                        slug={endpoint.providerId}
                        name={endpoint.providerName}
                        className="px-0 py-0"
                      />
                    </div>
                    {parameters.map((parameter, index) => {
                      const isSupported = supported.has(parameter)
                      const isHoveredColumn = hoveredColumn === index
                      const isHoveredCell =
                        hover?.kind === 'cell' &&
                        hover.endpointId === endpoint.id &&
                        hover.column === index

                      return (
                        <div
                          key={parameter}
                          role="gridcell"
                          aria-label={`${endpoint.providerName} ${isSupported ? 'supports' : 'does not support'} ${parameter}`}
                          onMouseEnter={() => {
                            setHover({ kind: 'cell', endpointId: endpoint.id, column: index })
                          }}
                          className={cn(
                            'flex items-center justify-center',
                            hover !== null &&
                              (isHoveredRow
                                ? 'opacity-100'
                                : isHoveredColumn
                                  ? 'opacity-75'
                                  : 'opacity-50'),
                          )}
                        >
                          <span
                            style={{ width: 'var(--fill)', height: 'var(--fill)' }}
                            className={cn(
                              'rounded-[3px] border',
                              isSupported
                                ? 'border-foreground/10 bg-foreground/25'
                                : 'bg-transparent',
                              isHoveredCell &&
                                (isSupported
                                  ? 'ring-1 ring-foreground/45'
                                  : 'ring-1 ring-foreground/35'),
                            )}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </ModelPageCard>
  )
}
