import type { CSSProperties } from 'react'

import { EntityOverviewTrigger } from '@/components/entity-overview/entity-overview-trigger'
import { EntityIdentity } from '@/components/shared/entity-identity'
import { CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { ModelPageCard } from './model-page-card'
import { buildColumnHoverStyles, buildParameterMatrix } from './parameter-comparison-matrix'
import type {
  ParameterColumn,
  ParameterMatrixData,
  ParameterRow,
} from './parameter-comparison-matrix'
import type { ModelEndpoint } from './types'

const LABEL_ANGLE_DEGREES = 45
const ROW_HEIGHT_REM = 2.75
const COLUMN_WIDTH_REM = 2.625
const MARK_SIZE_REM = 1.75
const LABEL_LIFT_REM = 0.25
const PROVIDER_COLUMN_REM = 10

export function ParameterComparisonCard({ endpoints }: { endpoints: readonly ModelEndpoint[] }) {
  const matrix = buildParameterMatrix(endpoints)

  return (
    <ModelPageCard title="Parameter Comparison">
      <CardContent className="grid gap-3 px-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <p className="min-w-64 flex-1 text-pretty">
            Parameter support varies by provider. Rare parameters constrain which providers can
            serve a request.
          </p>
          <ParameterComparisonLegend />
        </div>

        {matrix.columns.length === 0 ? (
          <div className="mb-4 rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">
            No provider parameters reported.
          </div>
        ) : (
          <ParameterSupportMatrix matrix={matrix} />
        )}
      </CardContent>
    </ModelPageCard>
  )
}

function ParameterComparisonLegend() {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-[3px] border border-foreground/15 bg-foreground/30"
        />
        supported
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-[3px] border border-border/70 bg-transparent"
        />
        not supported
      </span>
    </div>
  )
}

function ParameterSupportMatrix({ matrix }: { matrix: ParameterMatrixData<ModelEndpoint> }) {
  const layout = buildMatrixLayout(matrix.columns)
  const columnHoverStyles = buildColumnHoverStyles(matrix.columns.length)

  return (
    // The negative margin lets the scrollbar reach the card edge; inner padding
    // keeps the matrix aligned with the rest of the card content.
    <div className="-mx-4 overflow-x-auto px-4 pb-4">
      <style>{columnHoverStyles}</style>
      <table
        data-parameter-matrix=""
        className="block w-max font-mono text-sm"
        style={layout.tableStyle}
      >
        <caption className="sr-only">
          Parameter support by provider. Supported parameters are marked with a filled square.
        </caption>
        <ParameterMatrixHeader
          columns={matrix.columns}
          providerCount={matrix.rows.length}
          rowStyle={layout.headerRowStyle}
        />
        <tbody className="block">
          {matrix.rows.map((row) => (
            <ProviderParameterRow
              key={row.endpoint.uuid}
              columns={matrix.columns}
              row={row}
              rowStyle={layout.bodyRowStyle}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ParameterMatrixHeader({
  columns,
  providerCount,
  rowStyle,
}: {
  columns: readonly ParameterColumn[]
  providerCount: number
  rowStyle: CSSProperties
}) {
  return (
    <thead className="block">
      <tr className="grid" style={rowStyle}>
        <th
          scope="col"
          className="flex items-end pr-3 pb-1 text-left font-sans text-xs font-normal text-muted-foreground"
          style={{ minHeight: 'var(--header-h)' }}
        >
          Provider
        </th>
        {columns.map(({ parameter, supportCount }) => (
          <th
            key={parameter}
            scope="col"
            className="group/parameter relative p-0 text-left font-normal"
            title={`${parameter}: ${supportCount} of ${providerCount} providers`}
            style={{ minHeight: 'var(--header-h)' }}
          >
            {/* The underline acts as a leader from the label to its column. */}
            <span
              data-parameter-label=""
              className="absolute left-1/2 origin-bottom-left whitespace-nowrap text-foreground/65 underline decoration-foreground/20 decoration-1 underline-offset-2 transition-[color,text-decoration-color] duration-100 group-hover/parameter:text-foreground group-hover/parameter:decoration-foreground/60 motion-reduce:transition-none"
              style={{
                bottom: 'var(--label-lift)',
                transform: 'rotate(calc(-1 * var(--label-angle)))',
              }}
            >
              <span translate="no">{parameter}</span>
              <span className="sr-only">
                {`, supported by ${supportCount} of ${providerCount} providers`}
              </span>
            </span>
          </th>
        ))}
      </tr>
    </thead>
  )
}

function ProviderParameterRow({
  columns,
  row,
  rowStyle,
}: {
  columns: readonly ParameterColumn[]
  row: ParameterRow<ModelEndpoint>
  rowStyle: CSSProperties
}) {
  const { endpoint, supportedParameters } = row
  const isUnavailable = endpoint.unavailable_at !== undefined

  return (
    <tr
      style={rowStyle}
      className={cn(
        'grid rounded-[3px] transition-colors duration-100 hover:bg-foreground/4 motion-reduce:transition-none',
        isUnavailable && 'opacity-60',
      )}
    >
      <th scope="row" className="flex min-w-0 items-center pr-3 text-left font-normal">
        <EntityOverviewTrigger
          type="provider"
          slug={endpoint.provider.slug}
          className="max-w-full min-w-0 text-left"
        >
          <EntityIdentity
            slug={endpoint.provider.tag_slug}
            name={endpoint.provider.name}
            isAvailable={!isUnavailable}
            className="px-0 py-0"
          />
        </EntityOverviewTrigger>
        {isUnavailable ? <span className="sr-only">, unavailable</span> : null}
      </th>
      {columns.map(({ parameter }) => (
        <ParameterSupportCell key={parameter} isSupported={supportedParameters.has(parameter)} />
      ))}
    </tr>
  )
}

function ParameterSupportCell({ isSupported }: { isSupported: boolean }) {
  return (
    <td className="group/cell flex items-center justify-center p-0 transition-colors duration-100 hover:bg-foreground/4 motion-reduce:transition-none">
      <span className="sr-only">{isSupported ? 'Supported' : 'Not supported'}</span>
      <span
        aria-hidden="true"
        style={{ width: 'var(--mark-size)', height: 'var(--mark-size)' }}
        className={cn(
          'rounded-[3px] border transition-[background-color,border-color,box-shadow,transform] duration-100 group-hover/cell:scale-105 motion-reduce:transition-none',
          isSupported
            ? 'border-foreground/15 bg-foreground/30 group-hover/cell:border-foreground/25 group-hover/cell:bg-foreground/45 group-hover/cell:ring-1 group-hover/cell:ring-foreground/50'
            : 'border-foreground/10 bg-transparent group-hover/cell:ring-1 group-hover/cell:ring-foreground/35',
        )}
      />
    </td>
  )
}

function buildMatrixLayout(columns: readonly ParameterColumn[]) {
  let longestParameterLength = 0
  for (const column of columns) {
    longestParameterLength = Math.max(longestParameterLength, column.parameter.length)
  }

  const lastParameterLength = columns.at(-1)?.parameter.length ?? 0
  const penultimateParameterLength = columns.at(-2)?.parameter.length ?? 0
  const rowColumns = `${PROVIDER_COLUMN_REM}rem repeat(${columns.length}, var(--cell-width))`

  const tableStyle = {
    '--cell-width': `${COLUMN_WIDTH_REM}rem`,
    '--label-angle': `${LABEL_ANGLE_DEGREES}deg`,
    '--label-lift': `${LABEL_LIFT_REM}rem`,
    '--last-parameter-length': lastParameterLength,
    '--longest-parameter-length': longestParameterLength,
    '--mark-size': `${MARK_SIZE_REM}rem`,
    '--penultimate-parameter-length': penultimateParameterLength,
    '--header-h':
      'max(4rem, calc(var(--longest-parameter-length) * 1ch * sin(var(--label-angle)) + 1lh * cos(var(--label-angle)) + var(--label-lift) * 2))',
    // The last labels rotate beyond their column centres, so the table reserves
    // whichever overhang is greater to prevent horizontal clipping.
    paddingRight:
      'max(0px, calc(var(--last-parameter-length) * 1ch * cos(var(--label-angle)) - var(--cell-width) / 2), calc(var(--penultimate-parameter-length) * 1ch * cos(var(--label-angle)) - var(--cell-width) * 1.5))',
  } as CSSProperties

  return {
    tableStyle,
    headerRowStyle: { gridTemplateColumns: rowColumns },
    bodyRowStyle: {
      gridTemplateColumns: rowColumns,
      minHeight: `${ROW_HEIGHT_REM}rem`,
    },
  } satisfies Record<'bodyRowStyle' | 'headerRowStyle' | 'tableStyle', CSSProperties>
}
