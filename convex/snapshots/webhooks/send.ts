import { isResponseError, up } from 'up-fetch'

import type { DiscordPayload } from '../../discord/embeds/utils'

export type Delivery = {
  webhookUrl: string
  payloads: DiscordPayload[]
}

// * Config

const DELAY_BETWEEN_PAYLOADS_MS = 1000
const RETRY_ATTEMPTS = 3

// * Configured fetch with retry

const discordFetch = up(fetch, () => ({
  // Discord returns 204 No Content on success - don't try to parse JSON
  parseResponse: () => undefined,
  retry: {
    attempts: RETRY_ATTEMPTS,
    delay: (ctx) => Math.min(ctx.attempt ** 2 * 1000, 10_000), // 1s, 4s, 9s (capped at 10s)
    when: (ctx) => ctx.response?.status === 429 || (ctx.response?.status ?? 0) >= 500,
  },
}))

// * Helpers

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// * Send a single payload to Discord

async function sendPayload(webhookUrl: string, payload: DiscordPayload): Promise<void> {
  await discordFetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// * Send all deliveries with delay between payloads

export async function sendDeliveries(deliveries: Delivery[]): Promise<void> {
  const totalPayloads = deliveries.reduce((sum, d) => sum + d.payloads.length, 0)
  let sent = 0
  let failed = 0

  console.log('[webhooks:send] starting', {
    deliveries: deliveries.length,
    totalPayloads,
  })

  for (const delivery of deliveries) {
    const webhookLabel = delivery.webhookUrl.slice(0, 50) + '...'

    for (const payload of delivery.payloads) {
      await sleep(DELAY_BETWEEN_PAYLOADS_MS)

      try {
        await sendPayload(delivery.webhookUrl, payload)
        sent++
      } catch (err) {
        failed++
        const errorMsg = isResponseError(err)
          ? `${err.status}: ${err.data?.message ?? JSON.stringify(err.data)}`
          : String(err)
        console.error('[webhooks:send] payload failed after retries', {
          webhookUrl: webhookLabel,
          error: errorMsg,
        })
      }
    }

    console.log('[webhooks:send] delivery complete', {
      webhookUrl: webhookLabel,
      payloads: delivery.payloads.length,
    })
  }

  console.log('[webhooks:send] complete', { sent, failed, totalPayloads })
}
