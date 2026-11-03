import { createColumnHelper, rowSortingFeature, tableFeatures } from '@tanstack/react-table'
import type { CellData, RowData, TableFeatures } from '@tanstack/react-table'

import { EntityAvatar } from '#components/entity-avatar'
import type { EndpointRow } from '#endpoints/snapshot'
import { formatContext, formatCount, formatRateCell } from '#lib/format'

import { providerTags } from './tags'

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
  }
}

/** Sorting is controlled by the URL and applied upstream, so no sorted row model is registered. */
export const features = tableFeatures({ rowSortingFeature })

const helper = createColumnHelper<typeof features, EndpointRow>()

function ModelCell({ row }: { row: EndpointRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <EntityAvatar slug={row.model.id} />
      <span className="truncate text-[13px] leading-4">{row.model.name}</span>
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

/** Columns in display order. Lower is better for prices and latency; higher is better for the rest. */
export const columns = helper.columns([
  helper.accessor((row) => row.model.name, {
    cell: ({ row }) => <ModelCell row={row.original} />,
    header: 'Model',
    id: 'model',
    meta: { width: 190 },
    sortDescFirst: false,
  }),
  helper.accessor((row) => row.provider.display_name, {
    cell: ({ row }) => <ProviderCell row={row.original} />,
    header: 'Provider',
    id: 'provider',
    sortDescFirst: false,
  }),
  helper.accessor('input', {
    cell: ({ row }) => formatRateCell(row.original.rates.input),
    header: 'Input',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('output', {
    cell: ({ row }) => formatRateCell(row.original.rates.output),
    header: 'Output',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('cacheRead', {
    cell: ({ row }) => formatRateCell(row.original.rates.cacheRead),
    header: 'Cache R',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('throughput', {
    cell: ({ row }) => formatCount(row.original.throughput),
    header: 'Tok/s',
    meta: { numeric: true, width: 56 },
    sortDescFirst: true,
  }),
  helper.accessor('latency', {
    cell: ({ row }) => formatCount(row.original.latency),
    header: 'Latency',
    meta: { numeric: true, width: 68 },
    sortDescFirst: false,
  }),
  helper.accessor('context', {
    cell: ({ row }) => formatContext(row.original.context),
    header: 'Context',
    meta: { numeric: true, width: 68 },
    sortDescFirst: true,
  }),
])
