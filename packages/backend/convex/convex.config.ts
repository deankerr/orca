import workflow from '@convex-dev/workflow/convex.config.js'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    ORCA_R2_ACCESS_KEY_ID: v.string(),
    ORCA_R2_SECRET_ACCESS_KEY: v.string(),
    ORCA_R2_ACCOUNT_ID: v.string(),
    ORCA_R2_BUCKET: v.string(),

    DISCORD_BOT_TOKEN: v.string(),
    ORCA_PUBLIC_URL: v.string(),
    ENTITY_LOGO_SERVICE_ORIGIN: v.string(),
    DISCORD_APPLICATION_ID: v.optional(v.string()),
    DISCORD_PUBLIC_KEY: v.optional(v.string()),

    // Missing controls disable the corresponding scheduled job or backfill.
    ORCA_CRAWL_CRON_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    ORCA_WORKFLOWS_ANALYTICS_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    ORCA_WORKFLOWS_TOP_APPS_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    LEGACY_BACKFILL_END_SCAN_AT: v.optional(v.string()),
  },
})

app.use(workflow)

export default app
