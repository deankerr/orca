'use client'

import { EntityAvatar } from '@/components/shared/entity-avatar'
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
  if (endpoint.unavailableAt !== undefined) {
    return 'Gone'
  }

  if (endpoint.flags.disabled) {
    return 'Disabled'
  }

  if (endpoint.flags.deranked) {
    return 'Deranked'
  }

  return 'Available'
}

export function ProviderComparisonCard({ endpoints }: { endpoints: readonly ModelEndpoint[] }) {
  const sorted = [...endpoints].toSorted(
    (left, right) =>
      Number(left.unavailableAt !== undefined) - Number(right.unavailableAt !== undefined) ||
      left.providerName.localeCompare(right.providerName),
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
              <TableRow key={endpoint.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <EntityAvatar
                      slug={endpoint.providerId}
                      fallbackText={endpoint.providerName}
                      className="size-7"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{endpoint.providerName}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {endpoint.providerId}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={endpoint.unavailableAt === undefined ? 'outline' : 'destructive'}
                    className="rounded-sm"
                  >
                    {getEndpointAvailability(endpoint)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMtokPrice(endpoint.pricing.textInput)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMtokPrice(endpoint.pricing.textOutput)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(endpoint.contextLength)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(endpoint.maxOutput)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </ModelPageCard>
  )
}
