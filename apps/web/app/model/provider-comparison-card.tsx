'use client'

import { formatPricing } from '@orca/backend/shared/formatters'

import { EntityOverviewTrigger } from '@/components/entity-overview/entity-overview-trigger'
import { EntityIdentity } from '@/components/shared/entity-identity'
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
  const sorted = [...endpoints].toSorted(
    (left, right) =>
      Number(left.unavailable_at !== undefined) - Number(right.unavailable_at !== undefined) ||
      left.provider.name.localeCompare(right.provider.name),
  )
  const pricingColumns = PRICING_METRICS.filter((metric) =>
    metric.alwaysCompare
      ? true
      : endpoints.some((endpoint) => endpoint.pricing[metric.key] !== undefined),
  )

  return (
    <ModelPageCard title="Provider Comparison">
      <CardContent className="px-2">
        <Table className="min-w-[44rem]">
          <TableHeader className="text-muted-foreground">
            <TableRow>
              <TableHead>Provider</TableHead>
              {pricingColumns.map((metric) => (
                <TableHead key={metric.key} className="text-right">
                  {metric.label}
                </TableHead>
              ))}
              <TableHead className="text-right">Context</TableHead>
              <TableHead className="text-right">Max Out.</TableHead>
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
