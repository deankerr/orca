import { ingestEndpoints } from './endpoint'
import { ingestModels } from './model'
import { ingestProviders } from './provider'

export const ingest = {
  endpoint: ingestEndpoints,
  model: ingestModels,
  provider: ingestProviders,
}
