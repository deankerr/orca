import discordDelivery from '@orca/discord-delivery/convex.config.js'
import discordSender from '@orca/discord-sender/convex.config.js'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    ORCA_ADMIN_USER_ID: v.optional(v.string()),
    ORCA_OBJECTS_BACKEND: v.optional(v.union(v.literal('convex'), v.literal('r2'))),
    ORCA_OBJECTS_SOURCE_DEPLOYMENT: v.optional(v.string()),
    ORCA_OBJECTS_API_KEY: v.optional(v.string()),
    ORCA_OBJECTS_R2_ACCESS_KEY_ID: v.optional(v.string()),
    ORCA_OBJECTS_R2_SECRET_ACCESS_KEY: v.optional(v.string()),
    ORCA_OBJECTS_R2_ACCOUNT_ID: v.optional(v.string()),
    ORCA_OBJECTS_R2_BUCKET: v.optional(v.string()),

    ORCA_DISCORD_AUTO_SEND_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    ORCA_WEB_ORIGIN: v.string(),
    ORCA_LOGO_ORIGIN: v.string(),

    ORCA_INGESTION_CRON_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    ORCA_SCAN_CRON_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    ORCA_ANALYTICS_CRON_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    ORCA_TOP_APPS_CRON_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
  },
})

app.use(discordDelivery)
app.use(discordSender)

export default app
