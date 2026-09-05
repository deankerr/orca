import workflow from '@convex-dev/workflow/convex.config.js'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    LEGACY_BACKFILL_END_SCAN_AT: v.optional(v.string()),
  },
})

app.use(workflow)

export default app
