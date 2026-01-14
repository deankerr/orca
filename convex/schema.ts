import { defineSchema } from 'convex/server'

import { db } from './db'

export default defineSchema(
  {
    discord_alert_subscriptions: db.discord.subscriptions.table,

    or_sources: db.or.sources.table,

    or_views_changes: db.or.views.changes.table,
    or_views_endpoints: db.or.views.endpoints.table,
    or_views_models: db.or.views.models.table,
    or_views_providers: db.or.views.providers.table,

    snapshot_crawl_config: db.snapshot.crawl.config.table,
    snapshot_crawl_archives: db.snapshot.crawl.archives.table,

    webhook_subscriptions: db.webhook.subscriptions.table,
  },
  {
    strictTableNameTypes: true,
  },
)
