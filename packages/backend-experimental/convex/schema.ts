import { defineSchema } from 'convex/server'

import { catalogEndpointsTable, catalogEndpointPricingTable } from './catalog/endpoints/table'
import { catalogModelDescriptionsTable, catalogModelsTable } from './catalog/models/table'
import { catalogProvidersTable } from './catalog/providers/table'
import { catalogVersionsTable } from './catalog/versions/table'

export default defineSchema(
  {
    catalog_versions: catalogVersionsTable,
    catalog_endpoints: catalogEndpointsTable,
    catalog_endpoint_pricing: catalogEndpointPricingTable,
    catalog_models: catalogModelsTable,
    catalog_model_descriptions: catalogModelDescriptionsTable,
    catalog_providers: catalogProvidersTable,
  },
  {
    strictTableNameTypes: true,
    schemaValidation: false, // wipe dev data frequently
  },
)
