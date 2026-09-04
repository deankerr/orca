import { defineSchema } from 'convex/server'

// Always use direct imports for Convex tables in this file
import { endpointsTable } from './catalog/endpoints/table'
import { modelDescriptionsTable, modelsTable } from './catalog/models/table'
import { providersTable } from './catalog/providers/table'
import { changesTable } from './changes/table'
import { subscriptionsTable } from './discord/subscriptions/table'
import { LOCKS_TABLE, locksTable } from './locks/table'
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './objects/table'
import { publicApiV2CacheTable } from './public_api/v2/table'
import { archivesTable } from './snapshots/archives/table'
import {
  V3_ENDPOINTS_VIEW_TABLE,
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
  endpointsTable as v3EndpointsTable,
  modelsTable as v3ModelsTable,
  providersTable as v3ProvidersTable,
} from './v3/entities.table'
import {
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
  V3_ENDPOINTS_STATS_SERIES_TABLE,
  endpointsPricingTable,
  endpointsStatsTable,
} from './v3/series.table'

export default defineSchema(
  {
    alerts_discord_subscriptions: subscriptionsTable,

    [LOCKS_TABLE]: locksTable,
    [OBJECTS_LOCATORS_TABLE]: locatorsTable,

    or_views_changes: changesTable,
    or_views_endpoints: endpointsTable,
    or_views_providers: providersTable,
    or_views_models: modelsTable,
    or_views_model_descriptions: modelDescriptionsTable,

    public_api_v2_cache: publicApiV2CacheTable,

    snapshot_crawl_archives: archivesTable,

    [V3_ENDPOINTS_VIEW_TABLE]: v3EndpointsTable,
    [V3_MODELS_VIEW_TABLE]: v3ModelsTable,
    [V3_PROVIDERS_VIEW_TABLE]: v3ProvidersTable,
    [V3_ENDPOINTS_PRICING_SERIES_TABLE]: endpointsPricingTable,
    [V3_ENDPOINTS_STATS_SERIES_TABLE]: endpointsStatsTable,
  },
  {
    strictTableNameTypes: true,
  },
)
