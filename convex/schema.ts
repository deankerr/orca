import { defineSchema } from 'convex/server'

import { endpointsTable } from './catalog/endpoints'
import { modelDescriptionsTable, modelsTable } from './catalog/models'
import { providersTable } from './catalog/providers'
import { db } from './db'
import { subscriptionsTable } from './discord/subscriptions/table'
import { archivesTable } from './snapshots/archives/table'

export default defineSchema(
  {
    alerts_discord_subscriptions: subscriptionsTable,

    or_views_changes: db.or.views.changes.table,
    or_views_endpoints: endpointsTable,
    or_views_providers: providersTable,
    or_views_models: modelsTable,
    or_views_model_descriptions: modelDescriptionsTable,

    snapshot_crawl_archives: archivesTable,
  },
  {
    strictTableNameTypes: true,
  },
)
