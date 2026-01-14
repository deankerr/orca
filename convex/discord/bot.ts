import { isResponseError, up } from 'up-fetch'

import type { DiscordPayload } from './embeds/utils'

// Discord API base URL
const DISCORD_API_BASE = 'https://discord.com/api/v10'

// Rate limiting config
const DELAY_BETWEEN_MESSAGES_MS = 1000
const RETRY_ATTEMPTS = 3

// Configured fetch with retry for Discord API
const discordFetch = up(fetch, () => ({
  baseUrl: DISCORD_API_BASE,
  retry: {
    attempts: RETRY_ATTEMPTS,
    delay: (ctx) => Math.min(ctx.attempt ** 2 * 1000, 10_000), // 1s, 4s, 9s (capped at 10s)
    when: (ctx) => ctx.response?.status === 429 || (ctx.response?.status ?? 0) >= 500,
  },
}))

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Create a DM channel with a user (Discord creates or returns existing)
async function createDMChannel(args: { user_id: string; botToken: string }): Promise<string> {
  const { user_id, botToken } = args

  // up-fetch returns the parsed JSON directly
  const data = (await discordFetch('/users/@me/channels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({ recipient_id: user_id }),
  })) as { id: string }

  return data.id
}

// Send a message to a Discord channel via bot API
async function sendMessage(args: {
  channel_id: string
  payload: DiscordPayload
  botToken: string
}): Promise<void> {
  const { channel_id, payload, botToken } = args

  await discordFetch(`/channels/${channel_id}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(payload),
  })
}

// Delivery target for channel subscription
export type ChannelDelivery = {
  type: 'channel'
  channel_id: string
  pattern: string
  payloads: DiscordPayload[]
}

// Delivery target for DM subscription
export type DMDelivery = {
  type: 'dm'
  user_id: string
  pattern: string
  payloads: DiscordPayload[]
}

export type DiscordDelivery = ChannelDelivery | DMDelivery

// Cache for DM channel IDs (user_id -> channel_id)
const dmChannelCache = new Map<string, string>()

// Send all deliveries with delay between messages
export async function sendDiscordDeliveries(
  deliveries: DiscordDelivery[],
  botToken: string,
): Promise<void> {
  const totalPayloads = deliveries.reduce((sum, d) => sum + d.payloads.length, 0)
  let sent = 0
  let failed = 0

  console.log('[discord:bot] starting', {
    deliveries: deliveries.length,
    totalPayloads,
    channels: deliveries.filter((d) => d.type === 'channel').length,
    dms: deliveries.filter((d) => d.type === 'dm').length,
  })

  for (const delivery of deliveries) {
    // Resolve channel_id (direct for channels, create DM for users)
    let channelId: string
    const targetLabel = delivery.type === 'channel' ? delivery.channel_id : `DM:${delivery.user_id}`

    if (delivery.type === 'dm') {
      // Check cache first
      const cached = dmChannelCache.get(delivery.user_id)
      if (cached) {
        channelId = cached
      } else {
        try {
          channelId = await createDMChannel({ user_id: delivery.user_id, botToken })
          dmChannelCache.set(delivery.user_id, channelId)
        } catch (err) {
          const errorMsg = isResponseError(err)
            ? `${err.status}: ${err.data?.message ?? JSON.stringify(err.data)}`
            : String(err)
          console.error('[discord:bot] failed to create DM channel', {
            user_id: delivery.user_id,
            pattern: delivery.pattern,
            error: errorMsg,
          })
          failed += delivery.payloads.length
          continue
        }
      }
    } else {
      channelId = delivery.channel_id
    }

    for (const payload of delivery.payloads) {
      await sleep(DELAY_BETWEEN_MESSAGES_MS)

      try {
        await sendMessage({
          channel_id: channelId,
          payload,
          botToken,
        })
        sent++
      } catch (err) {
        failed++
        const errorMsg = isResponseError(err)
          ? `${err.status}: ${err.data?.message ?? JSON.stringify(err.data)}`
          : String(err)
        console.error('[discord:bot] message failed after retries', {
          target: targetLabel,
          pattern: delivery.pattern,
          error: errorMsg,
        })
      }
    }
  }

  console.log('[discord:bot] complete', { sent, failed, totalPayloads })
}
