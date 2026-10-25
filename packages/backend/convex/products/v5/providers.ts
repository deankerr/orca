import { Provider } from '@orca/contract/provider'
import { z } from 'zod'

import type { CurrentProviderRow } from '../../catalog/tables/current'
import { flagOrNull, stringsOrNull, textOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'

const url = z
  .url({ protocol: /^https?$/u })
  .nullable()
  .catch(null)

const Metadata = JsonObjectFromString.pipe(
  z.object({
    byokEnabled: flagOrNull,
    dataPolicy: z.object({ privacyPolicyURL: url, termsOfServiceURL: url }).nullable().catch(null),
    datacenters: stringsOrNull,
    headquarters: textOrNull,
    statusPageUrl: url,
  }),
)

/** Listed endpoints from a provider, by model. */
export interface ProviderListing {
  endpoints: number
  modelIds: ReadonlySet<string>
}

/** Catalog row to V5 contract, with its current listing summary. */
export function toProvider(
  row: CurrentProviderRow,
  listing: ProviderListing | undefined,
): Provider {
  const facts = Metadata.parse(row.metadata_json)

  return Provider.parse({
    byok_enabled: facts.byokEnabled,
    datacenters: facts.datacenters,
    headquarters: facts.headquarters,
    id: row.provider_id,
    listed_endpoints: listing?.endpoints ?? 0,
    listed_models: listing?.modelIds.size ?? 0,
    name: row.display_name,
    privacy_policy_url: facts.dataPolicy?.privacyPolicyURL ?? null,
    status_page_url: facts.statusPageUrl,
    terms_of_service_url: facts.dataPolicy?.termsOfServiceURL ?? null,
  })
}
