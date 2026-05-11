import type { EndpointProjection } from '@orca/backend/convex/catalog/endpoints'
import { formatPricing } from '@orca/backend/shared/formatters'
import type { ColumnDef } from '@tanstack/react-table'

import { DataGridColumnHeader } from '@/components/data-grid/data-grid-column-header'
import { Badge } from '@/components/ui/badge'
import { endpointAttributeSets } from '@/lib/attribute-groups'

import { EntityOverviewTrigger } from '../entity-overview/entity-overview-trigger'
import { AttributeBadgeSet } from '../shared/attribute-badge'
import { EndpointUuid } from '../shared/endpoint-uuid'
import { EntityIdentity } from '../shared/entity-identity'
import { dataGridPopoverHandle } from './popover-handle'

type EndpointProjectionLike = Omit<EndpointProjection, '_id'> & { _id: string }
export type EndpointRow = EndpointProjectionLike

function formatGridDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-CA')
}

function hasTextOutput(endpoint: EndpointRow) {
  return endpoint.model.output_modalities.includes('text')
}

function EmptyCell() {
  return <span className="text-muted-foreground">&ndash;</span>
}

export const columns: ColumnDef<EndpointRow>[] = [
  {
    id: 'uuid',
    accessorFn: (row) => row.uuid,
    header: ({ column }) => <DataGridColumnHeader column={column} title="UUID" />,
    cell: ({ row }) => (
      <EndpointUuid
        uuid={row.original.uuid}
        modelSlug={row.original.model.slug}
        handle={dataGridPopoverHandle}
      />
    ),
    size: 70,
    enableSorting: false,
    meta: {
      cellClassName: 'text-center px-1',
    },
  },

  {
    id: 'model',
    accessorFn: (row) => `${row.model.name} ${row.model.slug}`,
    header: ({ column }) => <DataGridColumnHeader column={column} title="MODEL" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntityOverviewTrigger
          type="model"
          slug={endpoint.model.slug}
          render={<EntityIdentity name={endpoint.model.name} slug={endpoint.model.slug} />}
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
    accessorFn: (row) => `${row.provider.name} ${row.provider.slug}`,
    header: ({ column }) => <DataGridColumnHeader column={column} title="PROVIDER" />,
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntityOverviewTrigger
          type="provider"
          slug={endpoint.provider.slug}
          render={
            <EntityIdentity name={endpoint.provider.name} slug={endpoint.provider.tag_slug} />
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
    accessorFn: (row) =>
      row.context_length === 0 && !hasTextOutput(row) ? undefined : row.context_length,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CONTEXT" subtitle="TOKENS" />
    ),
    cell: ({ getValue, row }) => {
      const contextLength = getValue<number | undefined>()

      if (contextLength === undefined && !hasTextOutput(row.original)) {
        return <EmptyCell />
      }

      return contextLength?.toLocaleString()
    },
    size: 105,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'maxOutput',
    accessorFn: (row) => (row.max_output === 0 && !hasTextOutput(row) ? undefined : row.max_output),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MAX OUT." subtitle="TOKENS" />
    ),
    cell: ({ getValue, row }) => {
      const maxOutput = getValue<number | undefined>()

      if (
        maxOutput === undefined &&
        row.original.max_output === 0 &&
        !hasTextOutput(row.original)
      ) {
        return <EmptyCell />
      }

      return maxOutput?.toLocaleString()
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
      row.quantization === undefined || row.quantization === 'unknown'
        ? undefined
        : row.quantization,
    header: ({ column }) => <DataGridColumnHeader column={column} title="QUANT." />,
    cell: ({ row }) => {
      const { quantization } = row.original
      const label = quantization === undefined || quantization === 'unknown' ? '?' : quantization

      if (label === '?' && !hasTextOutput(row.original)) {
        return null
      }

      return (
        <Badge variant="outline" className="font-mono text-xs uppercase">
          {label}
        </Badge>
      )
    },
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
    accessorFn: (row) => row.model.or_added_at,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MODEL" subtitle="AVAIL." />
    ),
    cell: ({ getValue }) => {
      const timestamp = getValue<number>()
      if (timestamp) {
        return formatGridDate(timestamp)
      }
      return <EmptyCell />
    },
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
]
