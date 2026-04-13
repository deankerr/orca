/**
 * Shared Discord API client using up-fetch
 *
 * Provides a consistent interface for all Discord API calls with:
 * - Automatic retry on rate limits (429) and server errors (5xx)
 * - Exponential backoff with max delay cap
 * - Bot token authentication
 */

import { isResponseError, up } from 'up-fetch'

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const RETRY_ATTEMPTS = 3

/**
 * Create a Discord API client with bot token authentication
 */
export function createDiscordClient(botToken: string) {
  return up(fetch, () => ({
    baseUrl: DISCORD_API_BASE,
    headers: { Authorization: `Bot ${botToken}` },
    retry: {
      attempts: RETRY_ATTEMPTS,
      delay: (ctx) => Math.min(ctx.attempt ** 2 * 1000, 10_000),
      when: (ctx) => ctx.response?.status === 429 || (ctx.response?.status ?? 0) >= 500,
    },
  }))
}

export type DiscordClient = ReturnType<typeof createDiscordClient>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getResponseData(error: { data: unknown }): unknown {
  return error.data
}

/**
 * Format error for logging - extracts status and data from up-fetch response errors
 */
export function formatDiscordError(err: unknown): unknown {
  if (!isResponseError(err)) {
    return String(err)
  }
  const responseData = getResponseData(err)
  // data may be a string (HTML error page) instead of a JSON object
  let data: Record<string, unknown>
  if (typeof responseData === 'string') {
    data = { body: responseData.slice(0, 2000) }
  } else if (isRecord(responseData)) {
    data = responseData
  } else {
    data = {}
  }
  return { status: err.status, ...data }
}
