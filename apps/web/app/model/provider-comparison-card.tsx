'use client'

import { EntityIdentity } from '@/components/shared/entity-identity'
import { Badge } from '@/components/ui/badge'
import { CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { ModelPageCard } from './model-page-card'
import type { ModelEndpoint } from './types'
import { formatMtokPrice, formatNumber } from './utils'

function getEndpointAvailability(endpoint: ModelEndpoint) {
  if (endpoint.unavailable_at !== undefined) {
    return 'Gone'
  }

  if (endpoint.disabled) {
    return 'Disabled'
  }

  if (endpoint.deranked) {
    return 'Deranked'
  }

  return 'Available'
}

export function ProviderComparisonCard({ endpoints }: { endpoints: readonly ModelEndpoint[] }) {
  const sorted = [...endpoints].toSorted(
    (left, right) =>
      Number(left.unavailable_at !== undefined) - Number(right.unavailable_at !== undefined) ||
      left.provider.name.localeCompare(right.provider.name),
  )

  return (
    <ModelPageCard title="Provider Comparison">
      <CardContent className="px-4 pb-4">
        <Table className="min-w-[44rem]">
          <TableHeader className="text-muted-foreground uppercase">
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Context</TableHead>
              <TableHead className="text-right">Max Out.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((endpoint) => (
              <TableRow key={endpoint.uuid}>
                <TableCell>
                  <EntityIdentity
                    slug={endpoint.provider.slug}
                    name={endpoint.provider.name}
                    isAvailable={endpoint.unavailable_at === undefined}
                    className="px-0 py-0"
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant={endpoint.unavailable_at === undefined ? 'outline' : 'destructive'}
                    className="rounded-sm"
                  >
                    {getEndpointAvailability(endpoint)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMtokPrice(endpoint.pricing.text_input)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMtokPrice(endpoint.pricing.text_output)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(endpoint.context_length)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(endpoint.max_output)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </ModelPageCard>
  )
}
