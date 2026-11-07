import { createColumnHelper, rowSortingFeature, tableFeatures } from '@tanstack/react-table'
import type { CellData, RowData, TableFeatures } from '@tanstack/react-table'
import { cn } from 'cn'

import { MODEL_COLUMN_WIDTH } from '#app/panel-layout'
import { EntityAvatar } from '#components/entity-avatar'
import type { EndpointRow } from '#endpoints/snapshot'
import { formatContext, formatCount, formatLatency, formatRateCell } from '#lib/format'

import { providerTags } from './tags'

declare module 'react' {
  // A `<col>`'s widths, which `FOLD_CLASSES` picks between (see `columnWidthStyle`).
  interface CSSProperties {
    '--col-folded-width'?: string
    '--col-width'?: string
  }
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Right-aligned monospace figures. */
    numeric?: boolean
    /** Pixel width in the fixed layout; the column without one takes the remaining space. */
    width?: number
    /** Hidden in a narrow Results panel, where the Model cell shows it as a second line instead. */
    folds?: boolean
  }
}

/**
 * A column's width in the fixed layout, and its width where the Table folds for the Endpoint drawer
 * (see `foldsForEndpoint`): Model then holds `MODEL_COLUMN_WIDTH` and Context, the last column, takes
 * the surplus, so the price columns after Model stay where the drawer's clear band expects them.
 * Elsewhere Model, the one column without a width, takes the surplus. `undefined` is that surplus.
 */
export function columnWidths(id: string, width: number | undefined) {
  if (id === 'model') {
    return { folded: MODEL_COLUMN_WIDTH, unfolded: width }
  }

  return { folded: id === 'context' ? undefined : width, unfolded: width }
}

const px = (width: number | undefined): string => (width === undefined ? 'auto' : `${width}px`)

/**
 * A `<col>`'s widths as custom properties, which `FoldClasses.width` picks between. They are CSS, not
 * an inline `width`, so the fold can choose before scripts run.
 */
export function columnWidthStyle(id: string, width: number | undefined) {
  const { folded, unfolded } = columnWidths(id, width)

  return { '--col-folded-width': px(folded), '--col-width': px(unfolded) }
}

/**
 * What a fold changes about the Table, as class names, for one thing that says the Table is folded.
 *
 * - `hidden`: hides a folding column's column, header, and cells.
 * - `only`: shown only where a column folds; the folded column's stand-in.
 * - `wrapper`: the Table wrapper's minimum width, narrower where folded.
 * - `width`: a `<col>`'s width, from `columnWidthStyle`.
 *
 * Every set also folds in a Results panel narrower than 32rem (a container query).
 */
interface FoldClasses {
  hidden: string
  only: string
  width: string
  wrapper: string
}

/**
 * The Provider column folds into the Model cell's second line (`meta.folds`) in two cases, and these
 * classes name both without a second layout: in a Results panel narrower than 32rem (a container query),
 * and wherever the Endpoint drawer can float beside the Table (`foldsForEndpoint`).
 *
 * The loaded Table knows the layout, so it sets `data-folded` on its wrapper, a `group/table`, and
 * reads `data`. The loading skeleton is rendered by the server for a page of unknown width and knows
 * only the Filters preference (the `orca-filters` cookie), so it reads the media query at the width
 * `foldWidth` gives for that preference (`collapsed` or `docked`). `min-[N]` is `width >= N`, and a
 * test keeps each N at `foldWidth`. The skeleton thereby draws the loaded Table's columns from its
 * first frame, so nothing shifts when the page hydrates or the catalogue arrives.
 */
export const FOLD_CLASSES = {
  collapsed: {
    hidden: '@max-lg/results:hidden min-[785px]:hidden',
    only: 'hidden @max-lg/results:inline-flex min-[785px]:inline-flex',
    width: 'w-(--col-width) min-[785px]:w-(--col-folded-width)',
    wrapper: 'min-w-190 @max-lg/results:min-w-144 min-[785px]:min-w-144',
  },
  data: {
    hidden: '@max-lg/results:hidden group-data-folded/table:hidden',
    only: 'hidden @max-lg/results:inline-flex group-data-folded/table:inline-flex',
    width: 'w-(--col-width) group-data-folded/table:w-(--col-folded-width)',
    wrapper: 'min-w-190 @max-lg/results:min-w-144 data-folded:min-w-144',
  },
  docked: {
    hidden: '@max-lg/results:hidden min-[1065px]:hidden',
    only: 'hidden @max-lg/results:inline-flex min-[1065px]:inline-flex',
    width: 'w-(--col-width) min-[1065px]:w-(--col-folded-width)',
    wrapper: 'min-w-190 @max-lg/results:min-w-144 min-[1065px]:min-w-144',
  },
} as const satisfies Record<string, FoldClasses>

/** What says the Table is folded: the loaded Table's `data-folded`, or the Filters preference's media query. */
export type FoldTrigger = keyof typeof FOLD_CLASSES

/** The loading skeleton's trigger: the media query for the user's Filters preference. */
export const skeletonFold = (filtersCollapsed: boolean): FoldTrigger =>
  filtersCollapsed ? 'collapsed' : 'docked'

/** Hides a folding column's column, header, and cells in the loaded Table. */
export const FOLDED_CLASS = FOLD_CLASSES.data.hidden

/** Shown only where a column folds in the loaded Table; the folded column's stand-in. */
export const FOLDED_ONLY_CLASS = FOLD_CLASSES.data.only

/** The folded column's second line in the Model cell. */
const FOLDED_LINE_FLEX_CLASS = 'hidden @max-lg/results:flex group-data-folded/table:flex'

/** Sorting is controlled by the URL and applied upstream, so no sorted row model is registered. */
export const features = tableFeatures({ rowSortingFeature })

/** Header text by column id, which the loading skeleton also reads. */
const LABELS = {
  cacheRead: 'Cache R',
  context: 'Context',
  input: 'Input',
  latency: 'Latency',
  model: 'Model',
  output: 'Output',
  provider: 'Provider',
  throughput: 'Tok/s',
} as const

const LABEL_BY_ID: ReadonlyMap<string, string> = new Map(Object.entries(LABELS))

/** The header text for a column id. */
export const columnLabel = (id: string | undefined): string | undefined =>
  id === undefined ? undefined : LABEL_BY_ID.get(id)

const helper = createColumnHelper<typeof features, EndpointRow>()

function ModelCell({ row }: { row: EndpointRow }) {
  const tags = providerTags(row.endpoint)

  return (
    <div className="flex min-w-0 items-center gap-2">
      <EntityAvatar slug={row.model.id} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] leading-4">{row.model.name}</span>
        {/* The Provider column, folded in where there is no room for it as a column. Only the name truncates; the tags are the precision and tier the Provider column shows as badges, so they stay whole. */}
        <span className={cn('min-w-0 items-baseline gap-1', FOLDED_LINE_FLEX_CLASS)}>
          <span
            className="min-w-0 truncate text-[11px] leading-3.5 text-muted-foreground"
            title={row.provider.display_name}
          >
            {row.provider.display_name}
          </span>
          {tags.length > 0 ? (
            <span className="shrink-0 text-[11px] leading-3.5 whitespace-nowrap text-muted-foreground">
              {`· ${tags.join(' · ')}`}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function ProviderCell({ row }: { row: EndpointRow }) {
  const tags = providerTags(row.endpoint)

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* The provider's slug, as in the Filters panel: the cell names the provider, and a routing tag such as `sambanova-turbo` can resolve to a different logo. */}
      <EntityAvatar slug={row.provider.id} />
      <span className="truncate text-[13px] leading-4">{row.provider.display_name}</span>
      {tags.map((tag) => (
        <span
          className="shrink-0 rounded-[3px] border border-border-solid px-1 font-mono text-[10px] leading-4 text-muted-foreground"
          key={tag}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

/**
 * Columns in display order. Model, the one column without a width, takes the space left over (but
 * see `columnWidth`, where Provider does); Provider is fitted to a typical name with its quantization and tier tags. Lower is better for prices and latency; higher is better for the rest. */
export const columns = helper.columns([
  helper.accessor((row) => row.model.name, {
    cell: ({ row }) => <ModelCell row={row.original} />,
    header: LABELS.model,
    id: 'model',
    sortDescFirst: false,
  }),
  helper.accessor((row) => row.provider.display_name, {
    cell: ({ row }) => <ProviderCell row={row.original} />,
    header: LABELS.provider,
    id: 'provider',
    meta: { folds: true, width: 184 },
    sortDescFirst: false,
  }),
  helper.accessor('input', {
    cell: ({ row }) => formatRateCell(row.original.rates.input),
    header: LABELS.input,
    id: 'input',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('output', {
    cell: ({ row }) => formatRateCell(row.original.rates.output),
    header: LABELS.output,
    id: 'output',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('cacheRead', {
    cell: ({ row }) => formatRateCell(row.original.rates.cacheRead),
    header: LABELS.cacheRead,
    id: 'cacheRead',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('throughput', {
    cell: ({ row }) => formatCount(row.original.throughput),
    header: LABELS.throughput,
    id: 'throughput',
    meta: { numeric: true, width: 56 },
    sortDescFirst: true,
  }),
  helper.accessor('latency', {
    cell: ({ row }) => formatLatency(row.original.latency),
    header: LABELS.latency,
    id: 'latency',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('context', {
    cell: ({ row }) => formatContext(row.original.context),
    header: LABELS.context,
    id: 'context',
    meta: { numeric: true, width: 68 },
    sortDescFirst: true,
  }),
])
