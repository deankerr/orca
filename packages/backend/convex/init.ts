import { v } from 'convex/values'

import { components } from '#generated/api'
import { env, internalMutation } from '#generated/server'

import { kickoff } from './ingestion/sync'
import { INGESTION_TARGET_TABLE } from './ingestion/tables'
import { setTarget } from './ingestion/target'
import { ALERTS_TOPIC } from './products/discord/delivery'

/** Initialization lookback before the captured instant. */
const INIT_LOOKBACK_MS = 24 * 60 * 60 * 1000

/**
 * Dev/preview bootstrap: subscribe the development alerts webhook, target the last day once,
 * then sync. A repeated run only resumes; registration is idempotent per URL.
 */
const init = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (env.ORCA_DEV_DISCORD_ALERTS_WEBHOOK !== undefined) {
      await ctx.runMutation(components.discordSender.api.registerWebhook, {
        name: 'Development ingestion alerts',
        topics: [ALERTS_TOPIC],
        url: env.ORCA_DEV_DISCORD_ALERTS_WEBHOOK,
      })
    }

    if ((await ctx.db.query(INGESTION_TARGET_TABLE).unique()) === null) {
      const now = Date.now()
      await setTarget(ctx, {
        end_at: new Date(now).toISOString(),
        start_at: new Date(now - INIT_LOOKBACK_MS).toISOString(),
      })
    }

    await kickoff(ctx)

    return null
  },
  returns: v.null(),
})

export default init
