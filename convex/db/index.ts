import * as discord_subscriptions from '../discord/subscriptions'
import * as or_sources from './or/sources'
import * as or_views_changes from './or/views/changes'
import * as or_views_endpoints from './or/views/endpoints'
import * as or_views_models from './or/views/models'
import * as or_views_providers from './or/views/providers'
import * as snapshot_crawl_archives from './snapshot/crawl/archives'
import * as snapshot_crawl_config from './snapshot/crawl/config'
import * as webhook_subscriptions from './webhook/subscriptions'

export const db = {
  discord: {
    subscriptions: discord_subscriptions,
  },
  or: {
    sources: or_sources,
    views: {
      changes: or_views_changes,
      endpoints: or_views_endpoints,
      models: or_views_models,
      providers: or_views_providers,
    },
  },
  snapshot: {
    crawl: {
      config: snapshot_crawl_config,
      archives: snapshot_crawl_archives,
    },
  },
  webhook: {
    subscriptions: webhook_subscriptions,
  },
}
