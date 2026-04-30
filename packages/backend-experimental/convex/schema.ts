import { defineSchema } from 'convex/server'

import * as catalogEndpoints from './catalog/endpoints/schema'
import * as catalogModels from './catalog/models/schema'
import * as catalogProviders from './catalog/providers/schema'
import * as endpointStats from './endpointStats/schema'

export default defineSchema(
  {
    catalog_endpoints_snapshots: catalogEndpoints.snapshotsTable,
    catalog_endpoints_state: catalogEndpoints.stateTable,
    catalog_endpoints_views: catalogEndpoints.viewsTable,
    catalog_models_snapshots: catalogModels.snapshotsTable,
    catalog_models_state: catalogModels.stateTable,
    catalog_models_views: catalogModels.viewsTable,
    catalog_providers_snapshots: catalogProviders.snapshotsTable,
    catalog_providers_state: catalogProviders.stateTable,
    catalog_providers_views: catalogProviders.viewsTable,
    endpoint_stats_samples: endpointStats.samplesTable,
  },
  {
    schemaValidation: true,
    strictTableNameTypes: true,
  },
)
