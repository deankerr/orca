import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'

import { api } from '@/convex/_generated/api'

import { SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { ActionLink } from '../shared/action-link'
import { DataList, DataListItem, DataListLabel, DataListValue } from '../shared/data-list'
import { ExternalLink } from '../shared/external-link'
import { EntitySheetHeader, EntitySheetSection } from './entity-sheet-components'
import { useFindAllEndpoints } from './use-find-all-endpoints'

export function ProviderSheet({ slug }: { slug: string }) {
  const findEndpoints = useFindAllEndpoints()

  const { data: provider, isPending: providerPending } = useQuery(
    convexQuery(api.providers.getBySlug, { slug }),
  )

  if (providerPending) {
    return (
      <>
        <SheetTitle className="sr-only">Loading Provider</SheetTitle>
        <div className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </>
    )
  }

  if (!provider) {
    return (
      <>
        <SheetTitle className="sr-only">Provider Not Found</SheetTitle>
        <div className="flex items-center justify-center p-8">
          <div className="text-muted-foreground">Provider not found</div>
        </div>
      </>
    )
  }

  return (
    <>
      <SheetTitle className="sr-only">{provider.name}</SheetTitle>
      {/* Header */}
      <SheetHeader className="pb-0">
        <EntitySheetHeader type="provider" slug={provider.slug} name={provider.name} />
      </SheetHeader>

      <div className="flex flex-col gap-6 pb-6 text-sm">
        {/* OpenRouter Link */}
        <div className="flex flex-col items-end gap-1 px-4 text-right">
          <ExternalLink href={`https://openrouter.ai/provider/${provider.slug}`} />
        </div>

        {/* Details Section */}
        <EntitySheetSection title="Details">
          <DataList>
            {provider.headquarters && (
              <DataListItem>
                <DataListLabel>Headquarters</DataListLabel>
                <DataListValue>{provider.headquarters}</DataListValue>
              </DataListItem>
            )}
            {provider.datacenters && provider.datacenters.length > 0 && (
              <DataListItem>
                <DataListLabel>Datacenters</DataListLabel>
                <DataListValue>{provider.datacenters.join(', ')}</DataListValue>
              </DataListItem>
            )}
            {provider.status_page_url && (
              <DataListItem>
                <DataListLabel>Status Page</DataListLabel>
                <DataListValue>
                  <ExternalLink href={provider.status_page_url} />
                </DataListValue>
              </DataListItem>
            )}
            {provider.terms_of_service_url && (
              <DataListItem>
                <DataListLabel>Terms of Service</DataListLabel>
                <DataListValue>
                  <ExternalLink href={provider.terms_of_service_url} />
                </DataListValue>
              </DataListItem>
            )}
            {provider.privacy_policy_url && (
              <DataListItem>
                <DataListLabel>Privacy Policy</DataListLabel>
                <DataListValue>
                  <ExternalLink href={provider.privacy_policy_url} />
                </DataListValue>
              </DataListItem>
            )}
          </DataList>
        </EntitySheetSection>

        {/* Related Endpoints Section */}
        <EntitySheetSection
          title="Endpoints"
          action={
            <ActionLink onClick={() => findEndpoints(provider.slug)}>Find all Endpoints</ActionLink>
          }
        />
      </div>
    </>
  )
}
