import { defineSchema } from 'convex/server'

import { endpointsTable } from './catalog/endpoints'
import { modelsTable } from './catalog/models'
import { providersTable } from './catalog/providers'
import { db } from './db'

export default defineSchema(
  {
    alerts_discord_subscriptions: db.alerts.discord.subscriptions.table,

    or_sources: db.or.sources.table,

    or_views_changes: db.or.views.changes.table,
    or_views_endpoints: endpointsTable,
    or_views_models: modelsTable,
    or_views_providers: providersTable,

    snapshot_crawl_config: db.snapshot.crawl.config.table,
    snapshot_crawl_archives: db.snapshot.crawl.archives.table,
  },
  {
    strictTableNameTypes: true,
  },
)
