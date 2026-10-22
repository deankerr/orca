import * as R from 'remeda'

import type { CurrentProviderRow } from '../../catalog/tables/current'
import { providerEntity } from '../lenses'
import { deriveCurrent } from './current'
import type { CurrentScope } from './current'
import type { Source } from './source'

const omittedMetadataKeys = [
  'slug',
  'adapterName',
  'baseUrl',
  'pricingStrategy',
  'regionOverrides',
  'hasChatCompletions',
  'hasCompletions',
  'isAbortable',
  'isMultipartSupported',
  'isPrivate',
  'moderationRequired',
  'requiredAttestationTypes',
  'editors',
  'owners',
  'ignoredProviderModels',
  'icon',
] as const

export function derive(source: Source, scope: CurrentScope): CurrentProviderRow[] {
  return deriveCurrent(
    source,
    scope,
    (scan) => scan.providers,
    (provider, { scan_at }) => {
      const { metadata, ...fields } = providerEntity(provider)

      return {
        ...fields,
        metadata_json: JSON.stringify(R.omit(metadata, omittedMetadataKeys)),
        scan_at,
      }
    },
  )
}
