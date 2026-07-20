'use client'

import { formatPricing } from '@orca/backend/shared/formatters'
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { EntityOverviewTrigger } from '@/components/entity-overview/entity-overview-trigger'
import { EntityIdentity } from '@/components/shared/entity-identity'
import { Button } from '@/components/ui/button'
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
import { PRICING_METRICS } from './pricing-fields'
import type { ModelEndpoint, PricingMetric } from './types'
import { formatNumber } from './utils'

type SortKey = 'provider' | 'context_length' | 'max_output' | PricingMetric
type SortDirection = 'asc' | 'desc'

function SortableHeader({
  children,
  column,
  direction,
  onSort,
  align = 'right',
}: {
  children: ReactNode
  column: SortKey
  direction?: SortDirection
  onSort: (column: SortKey) => void
  align?: 'left' | 'right'
}) {
  const Icon = direction === 'asc' ? ChevronUp : direction === 'desc' ? ChevronDown : ChevronsUpDown
  const handleClick = () => {
    onSort(column)
  }
  const icon = (
    <Icon
      data-icon={align === 'right' ? 'inline-start' : 'inline-end'}
      className={
        direction === undefined
          ? 'opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50'
          : undefined
      }
    />
  )

  return (
    <TableHead
      className={align === 'right' ? 'text-right' : undefined}
      aria-sort={
        direction === undefined ? 'none' : direction === 'asc' ? 'ascending' : 'descending'
      }
    >
      <Button
        variant="ghost"
        className={`group -mx-2 h-8 rounded-sm px-2 ${align === 'right' ? 'ml-auto' : ''}`}
        onClick={handleClick}
      >
        {align === 'right' ? icon : null}
        {children}
        {align === 'left' ? icon : null}
      </Button>
    </TableHead>
  )
}

function compareOptionalNumbers(
  left: number | undefined,
  right: number | undefined,
  direction: SortDirection,
): number {
  if (left === undefined) {
    return right === undefined ? 0 : 1
  }
  if (right === undefined) {
    return -1
  }
  return (left - right) * (direction === 'asc' ? 1 : -1)
}

function EndpointPrice({
  endpoint,
  pricingKey,
}: {
  endpoint: ModelEndpoint
  pricingKey: PricingMetric
}) {
  const formatted = formatPricing(pricingKey, endpoint.pricing[pricingKey])
  if (!formatted) {
    return <span className="text-muted-foreground">-</span>
  }

  return (
    <>
      {formatted.value}
      {formatted.unit ? (
        <span className="ml-1 text-xs text-muted-foreground">/{formatted.unit}</span>
      ) : null}
    </>
  )
}

export function ProviderComparisonCard({ endpoints }: { endpoints: readonly ModelEndpoint[] }) {
  const [sort, setSort] = useState<{ column: SortKey; direction: SortDirection }>({
    column: 'provider',
    direction: 'asc',
  })
  const sorted = useMemo(
    () =>
      endpoints.toSorted((left, right) => {
        const availabilityOrder =
          Number(left.unavailable_at !== undefined) - Number(right.unavailable_at !== undefined)
        if (availabilityOrder !== 0) {
          return availabilityOrder
        }

        const comparison =
          sort.column === 'provider'
            ? left.provider.name.localeCompare(right.provider.name) *
              (sort.direction === 'asc' ? 1 : -1)
            : compareOptionalNumbers(
                sort.column === 'context_length' || sort.column === 'max_output'
                  ? left[sort.column]
                  : left.pricing[sort.column],
                sort.column === 'context_length' || sort.column === 'max_output'
                  ? right[sort.column]
                  : right.pricing[sort.column],
                sort.direction,
              )

        return (
          comparison ||
          left.provider.name.localeCompare(right.provider.name) ||
          left.uuid.localeCompare(right.uuid)
        )
      }),
    [endpoints, sort],
  )
  const pricingColumns = PRICING_METRICS.filter((metric) =>
    metric.alwaysCompare
      ? true
      : endpoints.some((endpoint) => endpoint.pricing[metric.key] !== undefined),
  )
  const handleSort = (column: SortKey) => {
    setSort((current) => ({
      column,
      direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <ModelPageCard title="Provider Comparison">
      <CardContent className="px-2">
        <Table className="min-w-[44rem]">
          <TableHeader className="text-muted-foreground">
            <TableRow>
              <SortableHeader
                column="provider"
                direction={sort.column === 'provider' ? sort.direction : undefined}
                onSort={handleSort}
                align="left"
              >
                Provider
              </SortableHeader>
              {pricingColumns.map((metric) => (
                <SortableHeader
                  key={metric.key}
                  column={metric.key}
                  direction={sort.column === metric.key ? sort.direction : undefined}
                  onSort={handleSort}
                >
                  {metric.label}
                </SortableHeader>
              ))}
              <SortableHeader
                column="context_length"
                direction={sort.column === 'context_length' ? sort.direction : undefined}
                onSort={handleSort}
              >
                Context
              </SortableHeader>
              <SortableHeader
                column="max_output"
                direction={sort.column === 'max_output' ? sort.direction : undefined}
                onSort={handleSort}
              >
                Max Out.
              </SortableHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((endpoint) => (
              <TableRow key={endpoint.uuid}>
                <TableCell>
                  <EntityOverviewTrigger
                    type="provider"
                    slug={endpoint.provider.slug}
                    className="max-w-full min-w-0 text-left"
                  >
                    <EntityIdentity
                      slug={endpoint.provider.tag_slug}
                      name={endpoint.provider.name}
                      isAvailable={endpoint.unavailable_at === undefined}
                      className="px-0 py-0"
                    />
                  </EntityOverviewTrigger>
                </TableCell>
                {pricingColumns.map((metric) => (
                  <TableCell key={metric.key} className="text-right font-mono">
                    <EndpointPrice endpoint={endpoint} pricingKey={metric.key} />
                  </TableCell>
                ))}
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
