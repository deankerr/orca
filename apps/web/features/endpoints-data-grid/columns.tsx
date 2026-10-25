import { formatPrice } from '@orca/backend/numbers'
import type { ColumnDef } from '@tanstack/react-table'

import { EntityAvatar } from '@/components/shared/entity-avatar'
import {
  EntityIdentity,
  EntityIdentityContent,
  EntityIdentityName,
  EntityIdentitySlug,
} from '@/components/shared/entity-identity'
import { Badge } from '@/components/ui/badge'
import { EntityOverviewTrigger } from '@/features/entity-overview/trigger'

import { AttributeBadgeSet } from './attributes/attribute-badge'
import { endpointAttributeSets } from './attributes/attribute-groups'
import { DataGridColumnHeader } from './data-grid/data-grid-column-header'
import type { GridEndpoint } from './data/grid-endpoints'
import { EndpointUuid } from './popovers/endpoint-uuid'
import { dataGridPopoverHandle } from './popovers/popover-handle'

function formatGridDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-CA')
}

function EmptyCell() {
  return <span className="text-muted-foreground">&ndash;</span>
}

export const columns: ColumnDef<GridEndpoint>[] = [
  {
    accessorFn: (row) => `${row.model_display_name} ${row.model_id}`,
    cell: ({ row }) => {
      const endpoint = row.original

      return (
        <EntityOverviewTrigger type="model" slug={endpoint.model_id} className="size-full">
          <EntityIdentity>
            <EntityAvatar slug={endpoint.model_id} />
            <EntityIdentityContent>
              <EntityIdentityName>{endpoint.model_display_name}</EntityIdentityName>
              <EntityIdentitySlug>{endpoint.model_id}</EntityIdentitySlug>
            </EntityIdentityContent>
          </EntityIdentity>
        </EntityOverviewTrigger>
      )
    },
    enableHiding: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="MODEL" />,
    id: 'model',
    meta: {
      cellClassName: 'px-1.5',
    },
    size: 230,
  },

  {
    accessorFn: (row) => `${row.provider_display_name} ${row.provider_id}`,
    cell: ({ row }) => {
      const endpoint = row.original

      return (
        <EntityOverviewTrigger type="provider" slug={endpoint.provider_id} className="size-full">
          <EntityIdentity>
            <EntityAvatar slug={endpoint.provider_tag} />
            <EntityIdentityContent>
              <EntityIdentityName>{endpoint.provider_display_name}</EntityIdentityName>
              <EntityIdentitySlug>{endpoint.provider_tag}</EntityIdentitySlug>
            </EntityIdentityContent>
          </EntityIdentity>
        </EntityOverviewTrigger>
      )
    },
    enableHiding: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="PROVIDER" />,
    id: 'provider',
    meta: {
      cellClassName: 'px-1.5',
    },
    size: 180,
  },

  {
    accessorFn: (row) => row.pricing.text_input,
    cell: ({ getValue }) => {
      const inputPrice = getValue<number | undefined>()

      if (inputPrice !== undefined) {
        return formatPrice(inputPrice, 6)
      }

      return <EmptyCell />
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="INPUT" subtitle="$/MTOK" />
    ),
    id: 'inputPrice',
    meta: {
      cellClassName: 'text-right',
    },
    size: 110,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) => row.pricing.text_output,
    cell: ({ getValue }) => {
      const outputPrice = getValue<number | undefined>()

      if (outputPrice !== undefined) {
        return formatPrice(outputPrice, 6)
      }

      return <EmptyCell />
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="OUTPUT" subtitle="$/MTOK" />
    ),
    id: 'outputPrice',
    meta: {
      cellClassName: 'text-right',
    },
    size: 110,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) => row.pricing.cache_read,
    cell: ({ getValue }) => {
      const cacheReadPrice = getValue<number | undefined>()

      if (cacheReadPrice !== undefined) {
        return formatPrice(cacheReadPrice, 6)
      }

      return <EmptyCell />
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CACHE READ" subtitle="$/MTOK" />
    ),
    id: 'cacheReadPrice',
    meta: {
      cellClassName: 'text-right',
    },
    size: 120,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) => row.pricing.cache_write,
    cell: ({ getValue }) => {
      const cacheWritePrice = getValue<number | undefined>()

      if (cacheWritePrice !== undefined) {
        return formatPrice(cacheWritePrice, 6)
      }

      return <EmptyCell />
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CACHE WRITE" subtitle="$/MTOK" />
    ),
    id: 'cacheWritePrice',
    meta: {
      cellClassName: 'text-right',
    },
    size: 120,
    sortUndefined: 'last',
  },

  {
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
    enableSorting: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="MODALITIES" />,
    id: 'modalities',
    size: 155,
  },

  {
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
    enableSorting: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="FEATURES" />,
    id: 'features',
    size: 215,
  },

  {
    accessorFn: (row) => row.context_length ?? undefined,
    cell: ({ getValue }) => {
      const contextLength = getValue<number | undefined>()

      return contextLength?.toLocaleString() ?? <EmptyCell />
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="CONTEXT" subtitle="TOKENS" />
    ),
    id: 'contextLength',
    meta: {
      cellClassName: 'text-right',
    },
    size: 105,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) => row.max_output ?? undefined,
    cell: ({ getValue }) => {
      const maxOutput = getValue<number | undefined>()

      return maxOutput?.toLocaleString() ?? <EmptyCell />
    },
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MAX OUT." subtitle="TOKENS" />
    ),
    id: 'maxOutput',
    meta: {
      cellClassName: 'text-right',
    },
    size: 105,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) =>
      row.quantization === 'unknown' ? undefined : (row.quantization ?? undefined),
    cell: ({ getValue }) => (
      <Badge variant="outline" className="font-mono text-xs uppercase">
        {getValue<string | undefined>() ?? '?'}
      </Badge>
    ),
    header: ({ column }) => <DataGridColumnHeader column={column} title="QUANT." />,
    id: 'quantization',
    meta: {
      cellClassName: 'text-center px-2',
    },
    size: 90,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) => row.stats?.p50_throughput,
    cell: ({ getValue }) => {
      const throughput = getValue<number | undefined>()

      if (throughput !== undefined) {
        return throughput.toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })
      }

      return <EmptyCell />
    },
    header: ({ column }) => <DataGridColumnHeader column={column} title="TOKENS" subtitle="/SEC" />,
    id: 'throughput',
    meta: {
      cellClassName: 'text-right',
    },
    size: 90,
    sortUndefined: 'last',
  },

  {
    accessorFn: (row) => row.stats?.p50_latency,
    cell: ({ getValue }) => {
      const latency = getValue<number | undefined>()

      if (latency !== undefined) {
        return latency.toLocaleString('en-US', {
          maximumFractionDigits: 0,
        })
      }

      return <EmptyCell />
    },
    header: ({ column }) => <DataGridColumnHeader column={column} title="LATENCY" subtitle="MS" />,
    id: 'latency',
    meta: {
      cellClassName: 'text-right',
    },
    size: 95,
    sortUndefined: 'last',
  },

  {
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
    enableSorting: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="DATA POLICY" />,
    id: 'dataPolicy',
    size: 110,
  },

  {
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
    enableSorting: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="LIMITS" />,
    id: 'limits',
    size: 95,
  },

  {
    accessorFn: (row) => row.model_or_created_at,
    cell: ({ getValue }) => formatGridDate(getValue<string>()),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="MODEL" subtitle="AVAIL." />
    ),
    id: 'modelAddedAt',
    meta: {
      cellClassName: 'text-center',
    },
    size: 100,
    sortUndefined: 'last',
    sortingFn: 'basic',
  },

  {
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
    enableSorting: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="STATUS" />,
    id: 'status',
    meta: {
      cellClassName: 'justify-center',
    },
    size: 70,
  },

  {
    accessorFn: (row) => row.endpoint_id,
    cell: ({ row }) => (
      <EndpointUuid
        uuid={row.original.endpoint_id}
        modelSlug={row.original.model_id}
        handle={dataGridPopoverHandle}
      />
    ),
    enableSorting: false,
    header: ({ column }) => <DataGridColumnHeader column={column} title="UUID" />,
    id: 'uuid',
    meta: {
      cellClassName: 'text-center px-1',
    },
    size: 70,
  },
]
