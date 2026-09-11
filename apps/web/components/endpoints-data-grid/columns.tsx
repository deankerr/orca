import { formatPricing } from '@orca/backend/convex/shared/pricing'
import type { ColumnDef } from '@tanstack/react-table'

import { DataGridColumnHeader } from '@/components/data-grid/data-grid-column-header'
import { Badge } from '@/components/ui/badge'
import { endpointAttributeSets } from '@/lib/attribute-groups'
import type { GridEndpoint } from '@/lib/v3/grid-endpoints'

import { EntityOverviewTrigger } from '../entity-overview/trigger'
import { AttributeBadgeSet } from '../shared/attribute-badge'
import { EndpointUuid } from '../shared/endpoint-uuid'
import { EntityIdentity } from '../shared/entity-identity'
import { dataGridPopoverHandle } from './popover-handle'

function formatGridDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-CA')
}

function EmptyCell() {
  return <span className="text-muted-foreground">&ndash;</span>
}

export const columns: ColumnDef<GridEndpoint>[] = [
  {
    id: 'model',
    accessorFn: (row) => `${row.model_display_name} ${row.model_id}`,
    header: ({ column }) => <DataGridColumnHeader column={column} title="MODEL" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntityOverviewTrigger
          type="model"
          slug={endpoint.model_id}
          render={<EntityIdentity name={endpoint.model_display_name} slug={endpoint.model_id} />}
        />
      )
    },
    size: 230,
    enableHiding: false,
    meta: {
      cellClassName: 'px-1.5',
    },
  },

  {
    id: 'provider',
    accessorFn: (row) => `${row.provider_display_name} ${row.provider_id}`,
    header: ({ column }) => <DataGridColumnHeader column={column} title="PROVIDER" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntityOverviewTrigger
          type="provider"
          slug={endpoint.provider_id}
          render={
            <EntityIdentity name={endpoint.provider_display_name} slug={endpoint.provider_tag} />
          }
        />
      )
    },
    size: 180,
    enableHiding: false,
    meta: {
      cellClassName: 'px-1.5',
    },
  },

  {
    id: 'inputPrice',
    accessorFn: (row) => row.pricing.text_input,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="INPUT" subtitle="$/MTOK" />
    ),
    cell: ({ getValue }) => {
      const inputPrice = getValue<number | undefined>()
      if (inputPrice !== undefined) {
        return formatPricing('text_input', inputPrice)?.value
      }
      return <EmptyCell />
    },
    size: 110,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'outputPrice',
    accessorFn: (row) => row.pricing.text_output,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="OUTPUT" subtitle="$/MTOK" />
    ),
    cell: ({ getValue }) => {
      const outputPrice = getValue<number | undefined>()
      if (outputPrice !== undefined) {
        return formatPricing('text_output', outputPrice)?.value
      }
      return <EmptyCell />
    },
    size: 110,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'cacheReadPrice',
    accessorFn: (row) => row.pricing.cache_read,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CACHE READ" subtitle="$/MTOK" />
    ),
    cell: ({ getValue }) => {
      const cacheReadPrice = getValue<number | undefined>()
      if (cacheReadPrice !== undefined) {
        return formatPricing('cache_read', cacheReadPrice)?.value
      }
      return <EmptyCell />
    },
    size: 120,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'cacheWritePrice',
    accessorFn: (row) => row.pricing.cache_write,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CACHE WRITE" subtitle="$/MTOK" />
    ),
    cell: ({ getValue }) => {
      const cacheWritePrice = getValue<number | undefined>()
      if (cacheWritePrice !== undefined) {
        return formatPricing('cache_write', cacheWritePrice)?.value
      }
      return <EmptyCell />
    },
    size: 120,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
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
    size: 155,
    enableSorting: false,
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
    size: 215,
    enableSorting: false,
  },

  {
    id: 'contextLength',
    accessorFn: (row) => row.context_length ?? undefined,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CONTEXT" subtitle="TOKENS" />
    ),
    cell: ({ getValue }) => {
      const contextLength = getValue<number | undefined>()

      return contextLength?.toLocaleString() ?? <EmptyCell />
    },
    size: 105,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'maxOutput',
    accessorFn: (row) => row.max_output ?? undefined,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MAX OUT." subtitle="TOKENS" />
    ),
    cell: ({ getValue }) => {
      const maxOutput = getValue<number | undefined>()

      return maxOutput?.toLocaleString() ?? <EmptyCell />
    },
    size: 105,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'quantization',
    accessorFn: (row) =>
      row.quantization === 'unknown' ? undefined : (row.quantization ?? undefined),
    header: ({ column }) => <DataGridColumnHeader column={column} title="QUANT." />,
    cell: ({ getValue }) => (
      <Badge variant="outline" className="font-mono text-xs uppercase">
        {getValue<string | undefined>() ?? '?'}
      </Badge>
    ),
    size: 90,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-center px-2',
    },
  },

  {
    id: 'throughput',
    accessorFn: (row) => row.stats?.p50_throughput,
    header: ({ column }) => <DataGridColumnHeader column={column} title="TOKENS" subtitle="/SEC" />,
    cell: ({ getValue }) => {
      const throughput = getValue<number | undefined>()
      if (throughput !== undefined) {
        return throughput.toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })
      }
      return <EmptyCell />
    },
    size: 90,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'latency',
    accessorFn: (row) => row.stats?.p50_latency,
    header: ({ column }) => <DataGridColumnHeader column={column} title="LATENCY" subtitle="MS" />,
    cell: ({ getValue }) => {
      const latency = getValue<number | undefined>()
      if (latency !== undefined) {
        return latency.toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })
      }
      return <EmptyCell />
    },
    size: 95,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
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
    size: 110,
    enableSorting: false,
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
    size: 95,
    enableSorting: false,
  },

  {
    id: 'modelAddedAt',
    accessorFn: (row) => row.model_or_created_at,
    sortingFn: 'basic',
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MODEL" subtitle="AVAIL." />
    ),
    cell: ({ getValue }) => formatGridDate(getValue<string>()),
    size: 100,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-center',
    },
  },

  {
    id: 'status',
    header: ({ column }) => <DataGridColumnHeader column={column} title="STATUS" />,
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
    size: 70,
    enableSorting: false,
    meta: {
      cellClassName: 'justify-center',
    },
  },

  {
    id: 'uuid',
    accessorFn: (row) => row.endpoint_id,
    header: ({ column }) => <DataGridColumnHeader column={column} title="UUID" />,
    cell: ({ row }) => (
      <EndpointUuid
        uuid={row.original.endpoint_id}
        modelSlug={row.original.model_id}
        handle={dataGridPopoverHandle}
      />
    ),
    size: 70,
    enableSorting: false,
    meta: {
      cellClassName: 'text-center px-1',
    },
  },
]
