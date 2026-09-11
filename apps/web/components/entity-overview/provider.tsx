'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'

import { DataValue, DataLink } from './data'
import { OverviewHeader, OverviewActions, OverviewStatus } from './layout'

export function ProviderOverview({ slug }: { slug: string }) {
  const { data, isPending, error, refetch } = useQuery(
    convexQuery(api.v3.public.entityOverview.provider, { providerId: slug }),
  )

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
