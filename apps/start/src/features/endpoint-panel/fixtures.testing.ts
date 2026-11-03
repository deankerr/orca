import type { Endpoint } from '@orca/contract/endpoint'
import type { Model } from '@orca/contract/model'
import type { Provider } from '@orca/contract/provider'

import { AT, endpoint, models, providers } from '#features/endpoints/fixtures.testing'
import { buildRows } from '#features/endpoints/rows'
import type { EndpointRow } from '#features/endpoints/rows'

interface Changes {
  endpoint?: Partial<Endpoint>
  model?: Partial<Model>
  pricing?: Partial<Endpoint['pricing']>
  provider?: Partial<Provider>
}

/** One catalogue row built from the shared fixtures with the given Contract fields changed. */
export function rowWith({
  endpoint: changes,
  model,
  pricing,
  provider,
}: Changes = {}): EndpointRow {
  const base = endpoint({
    id: '90d0dbe6-0000-4000-8000-000000000000',
    model: models.gpt,
    provider: providers.openai,
  })

  const served = { ...base, ...changes, pricing: { ...base.pricing, ...pricing } }

  const [row] = buildRows({
    as_at: AT,
    endpoints: [served],
    models: [{ ...models.gpt, ...model }],
    providers: [{ ...providers.openai, ...provider }],
  })

  if (row === undefined) {
    throw new Error('Fixture row did not resolve')
  }

  return row
}
