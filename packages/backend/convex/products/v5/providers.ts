import { Provider } from '@orca/contract/provider'
import { z } from 'zod'

import type { CurrentProviderRow } from '../../catalog/tables/current'
import type { EventRow } from '../../catalog/tables/events'
import { flagOrNull, stringsOrNull, textOrNull } from '../../fields'
import { JsonObjectFromString } from '../../json'
import { field, project, translateStored } from './projection'
import type { Fields } from './projection'

const url = z
  .url({ protocol: /^https?$/u })
  .nullable()
  .catch(null)

const fact = (path: string[], schema: z.ZodType, options?: { set?: true }) =>
  field(['metadata', ...path], schema, options)

/** Provider Contract fields read from the catalog entity; listing fields are added by `toProvider`. */
export const providerFields = {
  byok_enabled: fact(['byokEnabled'], flagOrNull),
  datacenters: fact(['datacenters'], stringsOrNull, { set: true }),
  headquarters: fact(['headquarters'], textOrNull),
  id: field(['provider_id'], z.string()),
  name: field(['display_name'], z.string()),
  privacy_policy_url: fact(['dataPolicy', 'privacyPolicyURL'], url),
  status_page_url: fact(['statusPageUrl'], url),
  terms_of_service_url: fact(['dataPolicy', 'termsOfServiceURL'], url),
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
