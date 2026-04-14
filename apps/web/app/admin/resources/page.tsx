'use client'

import { api } from '@orca/backend/convex/_generated/api'

import { PageContainer, PageHeader, PageTitle } from '@/components/app-layout/pages'
import { EntityBadge } from '@/components/shared/entity-badge'
import { ExternalLink } from '@/components/shared/external-link'
import { useCachedQuery } from '@/hooks/use-cached-query'
import { getConvexHttpUrl } from '@/lib/utils'

export default function Page() {
  const models = useCachedQuery(api.models.list, {}, 'models-list')
  const providers = useCachedQuery(api.providers.list, {}, 'providers-list')

  return (
    <PageContainer className="py-4">
      <PageHeader>
        <PageTitle>Resources</PageTitle>
      </PageHeader>

      <div className="space-y-4 py-2 sm:px-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1 py-1 font-mono text-xs">
          <div className="-mb-1 w-full font-sans text-sm font-medium">JSON APIs</div>
          <ExternalLink href="https://openrouter.ai/api/v1/models">Models V1</ExternalLink>
          <ExternalLink href="https://openrouter.ai/api/frontend/models">Models FE</ExternalLink>
          <ExternalLink href="https://openrouter.ai/api/frontend/all-providers">
            Providers FE
          </ExternalLink>
          <ExternalLink href="https://openrouter.ai/api/frontend/models/find?">
            Analytics (Find)
          </ExternalLink>
          <ExternalLink href={getConvexHttpUrl('/public-api-preview/v2')}>ORCA V2</ExternalLink>
        </div>

        <div className="flex flex-wrap gap-3 py-1">
          <div className="-mb-1 w-full text-sm font-medium">Models</div>
          {models
            ?.toSorted((a, b) => a.name.localeCompare(b.name))
            .map((m) => (
              <div key={m._id} className="flex w-56 justify-between gap-2 border px-1 py-1">
                <EntityBadge name={m.name} slug={m.slug} />
                <div className="grid shrink-0 font-mono text-xs">
                  <ExternalLink href={`https://openrouter.ai/api/v1/models/${m.slug}/endpoints`}>
                    V1
                  </ExternalLink>
                  <ExternalLink
                    href={`https://openrouter.ai/api/frontend/stats/endpoint?permaslug=${m.version_slug}`}
                  >
                    FE
                  </ExternalLink>
                </div>
              </div>
            ))}
        </div>

        <div className="flex flex-wrap gap-3 py-1">
          <div className="-mb-1 w-full text-sm font-medium">Providers</div>
          {providers
            ?.toSorted((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <div key={p._id} className="flex w-60 justify-between gap-2 border px-1 py-1">
                <EntityBadge name={p.name} slug={p.slug} />
              </div>
            ))}
        </div>
      </div>
    </PageContainer>
  )
}
