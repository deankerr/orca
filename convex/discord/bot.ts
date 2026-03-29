import { z } from 'zod'

import { createDiscordClient, formatDiscordError, type DiscordClient } from './api'
import type { DiscordPayload } from './utils'

export type ChannelDelivery = {
  type: 'channel'
  channel_id: string
  pattern: string
  payloads: DiscordPayload[]
}

export type DMDelivery = {
  type: 'dm'
  user_id: string
  pattern: string
  payloads: DiscordPayload[]
}

export type DiscordDelivery = ChannelDelivery | DMDelivery

type ChannelResult = { ok: true; channelId: string } | { ok: false; error: unknown }

const DELAY_BETWEEN_MESSAGES_MS = 1000

// DM channel cache - safe for Convex actions because:
// 1. Actions are single-threaded per invocation
// 2. Cache is cleared when action completes
// 3. Prevents duplicate API calls for same user in one batch
const dmChannelCache = new Map<string, string>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function resolveChannelId(
  delivery: DiscordDelivery,
  discord: DiscordClient,
): Promise<ChannelResult> {
  if (delivery.type === 'channel') {
    return { ok: true, channelId: delivery.channel_id }
  }

  const cached = dmChannelCache.get(delivery.user_id)
  if (cached) return { ok: true, channelId: cached }

  try {
    const { id } = await discord('/users/@me/channels', {
      method: 'POST',
      body: { recipient_id: delivery.user_id },
      schema: z.object({ id: z.string() }),
    })
    dmChannelCache.set(delivery.user_id, id)
    return { ok: true, channelId: id }
  } catch (error) {
    return { ok: false, error }
  }
}

export async function sendDiscordDeliveries(
  deliveries: DiscordDelivery[],
  botToken: string,
): Promise<void> {
  const discord = createDiscordClient(botToken)
  const totalPayloads = deliveries.reduce((sum, d) => sum + d.payloads.length, 0)
  let sent = 0
  let failed = 0

  console.log('[discord:bot] starting', { deliveries: deliveries.length, payloads: totalPayloads })

  for (const delivery of deliveries) {
    const result = await resolveChannelId(delivery, discord)

    if (!result.ok) {
      console.error('[discord:bot] channel resolution failed', {
        delivery_type: delivery.type,
        user_id: delivery.type === 'dm' ? delivery.user_id : undefined,
        error: formatDiscordError(result.error),
      })
      failed += delivery.payloads.length
      continue
    }

    const { channelId } = result

    for (const payload of delivery.payloads) {
      try {
        await discord(`/channels/${channelId}/messages`, {
          method: 'POST',
          body: payload,
        })
        sent++
      } catch (err) {
        failed++
        console.error('[discord:bot] send failed', {
          channel: channelId,
          pattern: delivery.pattern,
          error: formatDiscordError(err),
        })
      }

      await sleep(DELAY_BETWEEN_MESSAGES_MS)
    }
  }

  console.log('[discord:bot] complete', { sent, failed })
}
