import type { ColumnDef } from '@tanstack/react-table'

import { DataGridColumnHeader } from '@/components/data-grid/data-grid-column-header'
import { Badge } from '@/components/ui/badge'
import type { ORCAEndpoint } from '@/convex/db/or/views/endpoints'
import { endpointAttributeSets } from '@/lib/attribute-groups'
import { formatPricing } from '@/shared/formatters'

import { EntitySheetTrigger } from '../entity-sheet/entity-sheet'
import { AttributeBadgeSet } from '../shared/attribute-badge'
import { EndpointUuid } from '../shared/endpoint-uuid'
import { EntityBadge } from '../shared/entity-badge'
import { dataGridPopoverHandle } from './popover-handle'

export type EndpointRow = ORCAEndpoint

function formatGridDate(timestamp: number): string {
  return new Date(timestamp)
    .toLocaleString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '')
    .split(' ')[0]
}

export const columns: ColumnDef<EndpointRow>[] = [
  {
    id: 'uuid',
    accessorFn: (row) => row.uuid,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="UUID" />
      </div>
    ),
    cell: ({ row }) => (
      <EndpointUuid
        uuid={row.original.uuid}
        modelSlug={row.original.model.slug}
        handle={dataGridPopoverHandle}
      />
    ),
    size: 75,
    enableSorting: false,
    meta: {
      headerTitle: 'UUID',
      cellClassName: 'text-center px-1',
    },
  },

  {
    id: 'model',
    accessorFn: (row) => `${row.model.name} ${row.model.slug}`,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MODEL" className="justify-start" />
    ),
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntitySheetTrigger type="model" slug={endpoint.model.slug} asChild>
          <EntityBadge name={endpoint.model.name} slug={endpoint.model.slug} />
        </EntitySheetTrigger>
      )
    },
    size: 230,
    enableHiding: false,

    meta: {
      headerTitle: 'Model',
      cellClassName: 'px-3',
    },
  },

  {
    id: 'provider',
    accessorFn: (row) => `${row.provider.name} ${row.provider.slug}`,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="PROVIDER" className="justify-start" />
    ),
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntitySheetTrigger type="provider" slug={endpoint.provider.slug} asChild>
          <EntityBadge name={endpoint.provider.name} slug={endpoint.provider.tag_slug} />
        </EntitySheetTrigger>
      )
    },
    size: 200,
    enableHiding: false,
    meta: {
      headerTitle: 'Provider',
      cellClassName: 'px-3',
    },
  },

  {
    id: 'status',
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="STATUS" />
      </div>
    ),
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <AttributeBadgeSet
          endpoint={endpoint}
          slots={endpointAttributeSets.status}
          handle={dataGridPopoverHandle}
        />
      )
    },
    size: 75,
    enableHiding: true,
    meta: {
      headerTitle: 'Status',
      cellClassName: 'justify-center',
    },
  },

  {
    id: 'inputPrice',
    accessorFn: (row) => row.pricing.text_input,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="INPUT" subtitle="$/MTOK" />
      </div>
    ),
    cell: ({ getValue }) => {
      const inputPrice = getValue<number>()
      if (inputPrice) {
        return formatPricing('text_input', inputPrice)?.value
      }
      return <span className="text-muted-foreground">&ndash;</span>
    },
    size: 100,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-right',
      headerTitle: 'Input ($/MTOK)',
    },
  },

  {
    id: 'outputPrice',
    accessorFn: (row) => row.pricing.text_output,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="OUTPUT" subtitle="$/MTOK" />
      </div>
    ),
    cell: ({ getValue }) => {
      const outputPrice = getValue<number>()
      if (outputPrice) {
        return formatPricing('text_output', outputPrice)?.value
      }
      return <span className="text-muted-foreground">&ndash;</span>
    },
    size: 100,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-right',
      headerTitle: 'Output ($/MTOK)',
    },
  },

  {
    id: 'modalities',
    header: ({ column }) => <DataGridColumnHeader column={column} title="MODALITIES" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <AttributeBadgeSet
          endpoint={endpoint}
          slots={endpointAttributeSets.modalities}
          handle={dataGridPopoverHandle}
        />
      )
    },
    size: 160,
    meta: {
      headerClassName: 'text-center',
      headerTitle: 'Modalities',
      cellClassName: 'px-2',
    },
  },

  {
    id: 'features',
    header: ({ column }) => <DataGridColumnHeader column={column} title="FEATURES" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <AttributeBadgeSet
          endpoint={endpoint}
          slots={endpointAttributeSets.features}
          reserve
          handle={dataGridPopoverHandle}
        />
      )
    },
    size: 254,
    meta: {
      headerClassName: 'text-center',
      headerTitle: 'Features',
      cellClassName: 'px-2',
    },
  },

  {
    id: 'contextLength',
    accessorFn: (row) => row.context_length,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="CONTEXT" subtitle="TOKENS" />
      </div>
    ),
    cell: ({ getValue }) => getValue<number>().toLocaleString(),
    size: 115,
    meta: {
      cellClassName: 'text-right',
      headerTitle: 'Context (TOK)',
    },
  },

  {
    id: 'maxOutput',
    accessorFn: (row) => row.max_output,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="MAX OUT." subtitle="TOKENS" />
      </div>
    ),
    cell: ({ getValue }) => getValue<number | undefined>()?.toLocaleString(),
    size: 115,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-right',
      headerTitle: 'Max Output (TOK)',
    },
  },

  {
    id: 'quantization',
    accessorFn: ({ quantization = '?' }) => (quantization === 'unknown' ? '?' : quantization),
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="QUANT." />
      </div>
    ),
    cell: ({ getValue }) => (
      <Badge
        variant="outline"
        className="h-7 rounded-sm font-mono text-sm tracking-wide uppercase shadow-sm"
      >
        {getValue<string>()}
      </Badge>
    ),
    size: 100,
    meta: {
      headerClassName: 'text-center',
      cellClassName: 'text-center px-2',
      headerTitle: 'Quant.',
    },
  },

  {
    id: 'throughput',
    accessorFn: (row) => row.stats?.p50_throughput,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="TOK/SEC" />
      </div>
    ),
    cell: ({ getValue }) => {
      const throughput = getValue<number | undefined>()
      if (throughput !== undefined) {
        return throughput.toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })
      }
      return <span className="text-muted-foreground">&ndash;</span>
    },
    size: 110,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-right',
      headerTitle: 'TOK/SEC',
    },
  },

  {
    id: 'latency',
    accessorFn: (row) => row.stats?.p50_latency,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="TTFT" subtitle="MS" />
      </div>
    ),
    cell: ({ getValue }) => {
      const latency = getValue<number | undefined>()
      if (latency !== undefined) {
        return latency.toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })
      }
      return <span className="text-muted-foreground">&ndash;</span>
    },
    size: 110,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-right',
      headerTitle: 'TTFT (MS)',
    },
  },

  {
    id: 'miscPricing',
    header: ({ column }) => <DataGridColumnHeader column={column} title="MISC $" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <AttributeBadgeSet
          endpoint={endpoint}
          slots={endpointAttributeSets.miscPricing}
          handle={dataGridPopoverHandle}
        />
      )
    },
    size: 80,
    meta: {
      headerClassName: 'text-center',
      headerTitle: 'Misc $',
      cellClassName: 'px-2',
    },
  },

  {
    id: 'dataPolicy',
    header: ({ column }) => <DataGridColumnHeader column={column} title="DATA POLICY" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <AttributeBadgeSet
          endpoint={endpoint}
          slots={endpointAttributeSets.dataPolicy}
          handle={dataGridPopoverHandle}
        />
      )
    },
    size: 150,
    meta: {
      headerClassName: 'text-center',
      headerTitle: 'Data Policy',
      cellClassName: 'px-2',
    },
  },

  {
    id: 'limits',
    header: ({ column }) => <DataGridColumnHeader column={column} title="LIMITS" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <AttributeBadgeSet
          endpoint={endpoint}
          slots={endpointAttributeSets.limits}
          handle={dataGridPopoverHandle}
        />
      )
    },
    size: 110,
    meta: {
      headerClassName: 'text-center',
      headerTitle: 'Limits',
      cellClassName: 'px-2',
    },
  },

  {
    id: 'modelAddedAt',
    accessorFn: (row) => row.model.or_added_at,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="ADDED" subtitle="MODEL" />
      </div>
    ),
    cell: ({ getValue }) => {
      const timestamp = getValue<number>()
      if (timestamp) {
        return formatGridDate(timestamp)
      }
      return <span className="text-muted-foreground">&ndash;</span>
    },
    size: 120,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-center',
      headerTitle: 'Model Added',
    },
  },

  {
    id: 'unavailableAt',
    accessorFn: (row) => row.unavailable_at,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="GONE" subtitle="ENDPOINT" />
      </div>
    ),
    cell: ({ getValue }) => {
      const timestamp = getValue<number>()
      if (timestamp) {
        return formatGridDate(timestamp)
      }
    },
    size: 120,
    sortUndefined: -1,
    meta: {
      cellClassName: 'text-center',
      headerTitle: 'Endpoint Gone',
    },
  },
]
