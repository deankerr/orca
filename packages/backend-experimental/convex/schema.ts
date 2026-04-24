import { defineSchema } from 'convex/server'

import * as catalogEndpoints from './catalog/endpoints/schema'
import * as catalogModels from './catalog/models/schema'
import * as catalogProviders from './catalog/providers/schema'

export default defineSchema(
  {
    catalog_endpoints: catalogEndpoints.stateTable,
    catalog_endpoints_content: catalogEndpoints.contentTable,
    catalog_models: catalogModels.stateTable,
    catalog_models_content: catalogModels.contentTable,
    catalog_providers: catalogProviders.stateTable,
    catalog_providers_content: catalogProviders.contentTable,
  },
  {
    strictTableNameTypes: true,
    schemaValidation: true,
  },
)
