import { docValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import { components } from '#generated/api'
import { internalMutation, internalQuery } from '#generated/server'

import { automaticRoutes, DEFAULT_ALERT_MAX_AGE_MS, MAX_ALERT_ROUTES } from './admission'
import { DISCORD_ROUTES_TABLE, discordRoutesTable } from './table'

/** Registration alone never subscribes a destination to automatic ORCA alerts. */
export const register = internalMutation({
  args: { key: v.string(), url: v.string(), name: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> =>
    await ctx.runMutation(components.discordDelivery.api.registerDestination, args),
})

/** ORCA routing policy lives here; the component only understands delivery destinations. */
export const configureRoute = internalMutation({
  args: { destinationKey: v.string(), enabled: v.boolean(), maxAgeMs: v.optional(v.number()) },
  returns: v.id(DISCORD_ROUTES_TABLE),
  handler: async (ctx, { destinationKey, enabled, maxAgeMs = DEFAULT_ALERT_MAX_AGE_MS }) => {
    if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
      throw new ConvexError('maxAgeMs must be a finite nonnegative duration.')
    }
    const destination = await ctx.runQuery(components.discordDelivery.api.getDestination, {
      key: destinationKey,
    })
    if (destination === null) {
      throw new ConvexError('Register the destination before configuring an ORCA route.')
    }
    const existing = await ctx.db
      .query(DISCORD_ROUTES_TABLE)
      .withIndex('by_destination', (q) => q.eq('destinationKey', destinationKey))
      .unique()
    const enabledRoutes = await automaticRoutes(ctx)
    if (enabled && existing?.enabled !== true && enabledRoutes.length >= MAX_ALERT_ROUTES) {
      throw new ConvexError(
        `At most ${MAX_ALERT_ROUTES} automatic alert destinations are supported.`,
      )
    }
    const row = { destinationKey, enabled, maxAgeMs }
    if (existing !== null) {
      await ctx.db.replace(DISCORD_ROUTES_TABLE, existing._id, row)
      return existing._id
    }
    return await ctx.db.insert(DISCORD_ROUTES_TABLE, row)
  },
})

export const routes = internalQuery({
  args: { enabled: v.optional(v.boolean()) },
  returns: v.array(docValidator(DISCORD_ROUTES_TABLE, discordRoutesTable)),
  handler: async (ctx, { enabled }) => {
    const query = ctx.db.query(DISCORD_ROUTES_TABLE)
    return await (
      enabled === undefined
        ? query.withIndex('by_destination')
        : query.withIndex('by_enabled', (q) => q.eq('enabled', enabled))
    ).take(100)
  },
})
