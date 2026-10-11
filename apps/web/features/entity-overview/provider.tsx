'use client'

import { useQuery } from '@tanstack/react-query'

import { useQueryResult } from '@/features/product-readiness/use-query-result'

import type { OverviewRequest } from './context'
import { DataValue, DataLink } from './data'
import { OverviewHeader, OverviewActions, OverviewStatus } from './layout'
import { providerOverviewQuery } from './query-options'

export function ProviderOverview({ request }: { request: OverviewRequest }) {
  const { slug } = request
  const { data, isPending, error, refetch, isSuccess } = useQuery(providerOverviewQuery(slug))
  useQueryResult(request.measurement, isSuccess && data !== null && data !== undefined)

  if (!data) {
    return (
      <OverviewStatus
        pending={isPending}
        error={!!error}
        kind="Provider"
        retry={() => {
          void refetch()
        }}
      />
    )
  }

  return (
    <>
      <OverviewHeader slug={slug} name={data.display_name} />
      <div className="flex flex-col gap-4 p-4">
        <OverviewActions type="provider" slug={slug} />
        <dl>
          <DataValue label="Headquarters" value={data.headquarters} />
          <DataValue label="Data Centers" value={data.datacenters} />
        </dl>
        <div>
          <DataLink label="OpenRouter" href={`https://openrouter.ai/provider/${slug}`} />
          <DataLink label="Service Status" href={data.statusPageUrl} />
          <DataLink
            label="Terms of Service"
            href={data['dataPolicy.termsOfServiceURL']}
            warnWhenMissing
          />
          <DataLink
            label="Privacy Policy"
            href={data['dataPolicy.privacyPolicyURL']}
            warnWhenMissing
          />
        </div>
      </div>
    </>
  )
}
