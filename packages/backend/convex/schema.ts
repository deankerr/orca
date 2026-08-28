import { defineSchema } from 'convex/server'

// Always use direct imports for Convex tables in this file
import { endpointsTable } from './catalog/endpoints/table'
import { modelDescriptionsTable, modelsTable } from './catalog/models/table'
import { providersTable } from './catalog/providers/table'
import { changesTable } from './changes/table'
import { subscriptionsTable } from './discord/subscriptions/table'
import { artifactsTable as meps2ArtifactsTable } from './meps2/tables/artifacts'
import { endpointsTable as mep2EndpointsTable } from './meps2/tables/endpoints'
import { modelsTable as mep2ModelsTable } from './meps2/tables/models'
import { pricingTable as meps2PricingTable } from './meps2/tables/pricing'
import { providersTable as mep2ProvidersTable } from './meps2/tables/providers'
import { runsTable as meps2RunsTable } from './meps2/tables/runs'
import { statsTable as meps2StatsTable } from './meps2/tables/stats'
import { publicApiV2CacheTable } from './public_api/v2/table'
import { archivesTable } from './snapshots/archives/table'

export default defineSchema(
  {
    alerts_discord_subscriptions: subscriptionsTable,

    meps2_artifacts: meps2ArtifactsTable,
    meps2_endpoints: mep2EndpointsTable,
    meps2_models: mep2ModelsTable,
    meps2_pricing: meps2PricingTable,
    meps2_providers: mep2ProvidersTable,
    meps2_runs: meps2RunsTable,
    meps2_stats: meps2StatsTable,

    or_views_changes: changesTable,
    or_views_endpoints: endpointsTable,
    or_views_providers: providersTable,
    or_views_models: modelsTable,
    or_views_model_descriptions: modelDescriptionsTable,

    public_api_v2_cache: publicApiV2CacheTable,

    snapshot_crawl_archives: archivesTable,
  },
  {
    strictTableNameTypes: true,
  },
)
