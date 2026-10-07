import { ConvexError } from 'convex/values'

import { internal } from '#generated/api'
import type { Id } from '#generated/dataModel'
import { env } from '#generated/server'
import type { MutationCtx, QueryCtx } from '#generated/server'

import { DISCORD_PREPARATIONS_TABLE, DISCORD_ROUTES_TABLE } from './table'

export const DEFAULT_ALERT_MAX_AGE_MS = 60 * 60 * 1000
export const MAX_ALERT_ROUTES = 20

export async function automaticRoutes(ctx: QueryCtx) {
  const routes = await ctx.db
    .query(DISCORD_ROUTES_TABLE)
    .withIndex('by_enabled', (q) => q.eq('enabled', true))
    .take(MAX_ALERT_ROUTES + 1)

  if (routes.length > MAX_ALERT_ROUTES) {
    throw new ConvexError(`At most ${MAX_ALERT_ROUTES} automatic alert destinations are supported.`)
  }

  return routes.map(({ destinationKey, maxAgeMs }) => ({ destinationKey, maxAgeMs }))
}

/** Called inside event commit: either both events and their obligation exist, or neither does. */
export async function admitAutomatic(
  ctx: MutationCtx,
  input: { scan_at: string; event_ids: Id<'v4_events'>[] },
) {
  if (env.ORCA_DISCORD_AUTO_SEND_ENABLED !== 'true' || input.event_ids.length === 0) {
    return null
  }

  const preparationId = await ctx.db.insert(DISCORD_PREPARATIONS_TABLE, {
    ...input,
    routes: await automaticRoutes(ctx),
    state: 'pending',
    attempts: 0,
  })
  await ctx.scheduler.runAfter(0, internal.alerts.discord.delivery.prepare, { preparationId })
  return preparationId
}
