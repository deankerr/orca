import { defineApp } from 'convex/server'
import { v } from 'convex/values'

/** Deployment environment contract; project defaults supply values for new dev and preview deployments. */
const app = defineApp({
  env: {
    /** Storage for newly written artifacts; defaults to Convex. Existing objects retain their stored backend. */
    ORCA_OBJECTS_BACKEND: v.optional(v.union(v.literal('convex'), v.literal('r2'))),
    /** R2 access key used to sign object requests; required whenever accessing R2-backed artifacts. */
    ORCA_R2_ACCESS_KEY_ID: v.optional(v.string()),
    /** Secret paired with the R2 access key; required whenever accessing R2-backed artifacts. */
    ORCA_R2_SECRET_ACCESS_KEY: v.optional(v.string()),
    /** Cloudflare account owning the R2 bucket; required whenever accessing R2-backed artifacts. */
    ORCA_R2_ACCOUNT_ID: v.optional(v.string()),
    /** R2 bucket for artifact reads and writes; required whenever accessing R2-backed artifacts. */
    ORCA_R2_BUCKET: v.optional(v.string()),

    /** Legacy production bot credential; intentionally defaults to an empty string in dev and previews. */
    DISCORD_BOT_TOKEN: v.string(),
    /** Web app URL used to construct endpoint-grid links in legacy Discord messages. */
    ORCA_PUBLIC_URL: v.string(),
    /** Source Convex cloud URL; absent/empty skips catalog seeding but fails explicit named-artifact pulls. */
    ORCA_PULL_SOURCE_URL: v.optional(v.string()),
    /** Deployed logo-service origin for publicly reachable icons in legacy Discord embeds. */
    ENTITY_LOGO_SERVICE_ORIGIN: v.string(),
    /** Legacy Discord application ID required when registering slash commands. */
    DISCORD_APPLICATION_ID: v.optional(v.string()),
    /** Ed25519 key for verifying Discord interactions; an absent or empty key rejects requests. */
    DISCORD_PUBLIC_KEY: v.optional(v.string()),

    // These controls enable their entry points only for 'true'; absent/false disables them.
    /** Enables the hourly legacy snapshot crawl and its downstream materialization. */
    ORCA_CRAWL_CRON_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    /** Enables scheduled scan ingestion into catalog views and historical series, independently of capture. */
    ORCA_INGEST_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    /** Enables scheduled change-event ingestion and processing, independently of catalog-view ingestion. */
    ORCA_CES_INGEST_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    /** Enables upstream scan capture, including manual calls to the scan action; ingestion is separate. */
    ORCA_SCAN_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    /** Enables the daily upstream analytics collection workflow. */
    ORCA_WORKFLOWS_ANALYTICS_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
    /** Enables the daily upstream top-apps collection workflow. */
    ORCA_WORKFLOWS_TOP_APPS_ENABLED: v.optional(v.union(v.literal('true'), v.literal('false'))),
  },
})

export default app
