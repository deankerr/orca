import * as alerts_discord_subscriptions from './alerts/discord/subscriptions'
import * as or_views_changes from './or/views/changes'
import * as snapshot_crawl_archives from './snapshot/crawl/archives'
import * as snapshot_crawl_config from './snapshot/crawl/config'

export const db = {
  alerts: {
    discord: {
      subscriptions: alerts_discord_subscriptions,
    },
  },
  or: {
    views: {
      changes: or_views_changes,
    },
  },
  snapshot: {
    crawl: {
      config: snapshot_crawl_config,
      archives: snapshot_crawl_archives,
    },
  },
}
