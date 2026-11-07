import { createColumnHelper, rowSortingFeature, tableFeatures } from '@tanstack/react-table'
import type { CellData, RowData, TableFeatures } from '@tanstack/react-table'
import { cn } from 'cn'

import {
  FIGURE_COLUMN_WIDTH,
  MODEL_COLUMN_WIDTH_CSS,
  PROVIDER_COLUMN_WIDTH,
} from '#app/panel-layout'
import { EntityAvatar } from '#components/entity-avatar'
import type { EndpointRow } from '#endpoints/snapshot'
import { formatContext, formatCount, formatLatency, formatRateCell } from '#lib/format'

import { providerTags } from './tags'

declare module '@tanstack/react-table' {
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Right-aligned monospace figures. */
    numeric?: boolean
    /** Pixel width in the fixed layout; Model, without one, follows the panel's (`columnWidthStyle`). */
    width?: number
    /** Hidden where the Table folds, and shown as the Model cell's second line instead. */
    folds?: boolean
  }
}

/**
 * A `<col>`'s width. Model's follows the Results container's width (`MODEL_COLUMN_WIDTH_CSS`); every
 * other column has its own. None takes the surplus: the Table ends with `FILLER_COLUMN`, which does.
 * It is inline CSS rather than a measurement, so the server's HTML lays out the loaded Table's columns.
 */
export function columnWidthStyle(id: string, width: number | undefined) {
  return { width: id === 'model' ? MODEL_COLUMN_WIDTH_CSS : `${width ?? 0}px` }
}

/*
 * The Provider column folds into the Model cell's second line (`meta.folds`) in a Results panel
 * narrower than `UNFOLD_RESULTS_WIDTH`, by container query, and the Model header carries a second sort
 * button for it. The Results width is all the fold reads, so the server's HTML, the loading skeleton,
 * and the loaded Table fold at the same width, and neither Filters nor the drawer moves it.
 *
 * The queries sit either side of `UNFOLD_CONTAINER_WIDTH`, the Results frame's content width:
 * `@max-[N]` is `width < N` and `@min-[N]` is `width >= N`. Tailwind reads whole class names, so each
 * is written out; a test keeps them at the constant.
 */

/** Hides a folding column's column, header, and cells where it folds. */
export const FOLDED_CLASS = '@max-[951px]/results:hidden'

/** Shown only where a column folds; the folded column's stand-in. */
export const FOLDED_ONLY_CLASS = 'inline-flex @min-[951px]/results:hidden'

/** The folded column's second line in the Model cell. */
export const FOLDED_LINE_FLEX_CLASS = 'flex @min-[951px]/results:hidden'

/**
 * The Table wrapper's minimum width: the folded Table's columns (Model at its narrowest and the
 * figures), so a narrower panel scrolls it sideways. Unfolded, the panel is wider than its columns.
 */
export const TABLE_MIN_WIDTH_CLASS = 'min-w-144'

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
 * Columns in display order. Model's width follows the panel's (`columnWidthStyle`); Provider is fitted
 * to a typical name with its quantization and tier tags. The three price columns directly follow
 * Provider: they are the drawer's clear band (`MIN_VISIBLE_FIGURES_WIDTH`). Lower is better for prices
 * and latency; higher is better for the rest.
 */
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
    meta: { folds: true, width: PROVIDER_COLUMN_WIDTH },
    sortDescFirst: false,
  }),
  helper.accessor('input', {
    cell: ({ row }) => formatRateCell(row.original.rates.input),
    header: LABELS.input,
    id: 'input',
    meta: { numeric: true, width: FIGURE_COLUMN_WIDTH },
    sortDescFirst: false,
  }),
  helper.accessor('output', {
    cell: ({ row }) => formatRateCell(row.original.rates.output),
    header: LABELS.output,
    id: 'output',
    meta: { numeric: true, width: FIGURE_COLUMN_WIDTH },
    sortDescFirst: false,
  }),
  helper.accessor('cacheRead', {
    cell: ({ row }) => formatRateCell(row.original.rates.cacheRead),
    header: LABELS.cacheRead,
    id: 'cacheRead',
    meta: { numeric: true, width: FIGURE_COLUMN_WIDTH },
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
    meta: { numeric: true, width: FIGURE_COLUMN_WIDTH },
    sortDescFirst: false,
  }),
  helper.accessor('context', {
    cell: ({ row }) => formatContext(row.original.context),
    header: LABELS.context,
    id: 'context',
    meta: { numeric: true, width: FIGURE_COLUMN_WIDTH },
    sortDescFirst: true,
  }),
])
