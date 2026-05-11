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

function hasTextOutput(endpoint: EndpointRow) {
  return endpoint.model.output_modalities.includes('text')
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
    size: 70,
    enableSorting: false,
    meta: {
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
        <EntityOverviewTrigger
          type="model"
          slug={endpoint.model.slug}
          render={
            <EntityIdentity
              name={endpoint.model.name}
              slug={endpoint.model.slug}
              className="font-sans"
            />
          }
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
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="PROVIDER" className="justify-start" />
    ),
    cell: ({ row }) => {
      const endpoint = row.original
      return (
        <EntityOverviewTrigger
          type="provider"
          slug={endpoint.provider.slug}
          render={
            <EntityIdentity
              name={endpoint.provider.name}
              slug={endpoint.provider.tag_slug}
              className="font-sans"
            />
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
    meta: {
      headerClassName: 'text-center',
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
    size: 215,
    meta: {
      headerClassName: 'text-center',
    },
  },

  {
    id: 'contextLength',
    accessorFn: (row) =>
      row.context_length === 0 && !hasTextOutput(row) ? undefined : row.context_length,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="CONTEXT" subtitle="TOKENS" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const contextLength = getValue<number | undefined>()

      if (contextLength === undefined && !hasTextOutput(row.original)) {
        return <span className="text-muted-foreground">&ndash;</span>
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
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="MAX OUT." subtitle="TOKENS" />
      </div>
    ),
    cell: ({ getValue, row }) => {
      const maxOutput = getValue<number | undefined>()

      if (
        maxOutput === undefined &&
        row.original.max_output === 0 &&
        !hasTextOutput(row.original)
      ) {
        return <span className="text-muted-foreground">&ndash;</span>
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
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="QUANT." />
      </div>
    ),
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
      headerClassName: 'text-center',
      cellClassName: 'text-center px-2',
    },
  },

  {
    id: 'throughput',
    accessorFn: (row) => row.stats?.p50_throughput,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="TOKENS" subtitle="/SEC" />
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
    size: 90,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-right',
    },
  },

  {
    id: 'latency',
    accessorFn: (row) => row.stats?.p50_latency,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="LATENCY" subtitle="MS" />
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
    size: 90,
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
    meta: {
      headerClassName: 'text-center',
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
    size: 95,
    meta: {
      headerClassName: 'text-center',
    },
  },

  {
    id: 'modelAddedAt',
    accessorFn: (row) => row.model.or_added_at,
    header: ({ column }) => (
      <div className="grow text-center">
        <DataGridColumnHeader column={column} title="MODEL" subtitle="AVAIL." />
      </div>
    ),
    cell: ({ getValue }) => {
      const timestamp = getValue<number>()
      if (timestamp) {
        return formatGridDate(timestamp)
      }
      return <span className="text-muted-foreground">&ndash;</span>
    },
    size: 100,
    sortUndefined: 'last',
    meta: {
      cellClassName: 'text-center',
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
    size: 70,
    enableHiding: true,
    meta: {
      cellClassName: 'justify-center',
    },
  },
]
