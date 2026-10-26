import { Provider } from '@orca/contract/provider'
import { z } from 'zod'

import type { CurrentProviderRow } from '../../catalog/tables/current'
import type { EventRow } from '../../catalog/tables/events'
import { flagOrNull, stringsOrNull, textOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'
import { field, project, translateStored } from './projection'
import type { Fields, Kind, KindValues } from './projection'

const url = z
  .url({ protocol: /^https?$/u })
  .nullable()
  .catch(null)

const fromMetadata = <K extends Kind>(kind: K, path: string[], schema: z.ZodType<KindValues[K]>) =>
  field(kind, ['metadata', ...path], schema)

/** Provider Contract fields read from the catalog entity; listing fields are added by `toProvider`. */
export const providerFields = {
  byok_enabled: fromMetadata('flag', ['byokEnabled'], flagOrNull),
  datacenters: fromMetadata('list', ['datacenters'], stringsOrNull),
  display_name: field('text', ['display_name'], z.string()),
  headquarters: fromMetadata('text', ['headquarters'], textOrNull),
  id: field('text', ['provider_id'], z.string()),
  // Upstream has always supplied a name; a missing one is a source failure, not unknown.
  name: fromMetadata('text', ['name'], z.string().trim().min(1)),
  privacy_policy_url: fromMetadata('text', ['dataPolicy', 'privacyPolicyURL'], url),
  status_page_url: fromMetadata('text', ['statusPageUrl'], url),
  terms_of_service_url: fromMetadata('text', ['dataPolicy', 'termsOfServiceURL'], url),
} satisfies Fields

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
  const metadata = JsonObjectFromString.parse(row.metadata_json)

  return Provider.parse({
    ...project(providerFields, { ...row, metadata }),
    listed_endpoints: listing?.endpoints ?? 0,
    listed_models: listing?.modelIds.size ?? 0,
  })
}

/** Stored provider UPDATE to Contract field changes. */
export function translateProviderUpdate(row: Extract<EventRow, { entity_kind: 'provider' }>) {
  return translateStored(providerFields, row.change_json)
}
