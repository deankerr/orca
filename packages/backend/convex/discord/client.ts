import type {
  RESTPostAPICurrentUserCreateDMChannelJSONBody,
  RESTPostAPICurrentUserCreateDMChannelResult,
  RESTPostAPIWebhookWithTokenJSONBody,
} from 'discord-api-types/v10'
import { up } from 'up-fetch'

import { getEnv } from '../lib/env'

const RETRY_ATTEMPTS = 3

export function createDiscordClient() {
  const token = getEnv('DISCORD_BOT_TOKEN')

  return up(fetch, () => ({
    baseUrl: 'https://discord.com/api/v10',
    method: 'POST',
    headers: { Authorization: `Bot ${token}` },
    retry: {
      attempts: RETRY_ATTEMPTS,
      // Respect Discord's Retry-After on 429; fall back to exponential backoff for 5xx
      delay: ({
        response,
        attempt,
      }: {
        response: Response | undefined
        attempt: number
        error: unknown
        request: Request
      }) => {
        if (response?.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          if (retryAfter !== null) {
            return Number.parseFloat(retryAfter) * 1000
          }
        }
        return Math.min(attempt ** 2 * 1000, 10_000)
      },
      when: ({ response }: { response: Response | undefined; error: unknown; request: Request }) =>
        response?.status === 429 || (response?.status ?? 0) >= 500,
      onRetry: ({ attempt, response }: { attempt: number; response: Response | undefined }) => {
        console.warn(`Discord request retry`, {
          attempt,
          status: response?.status,
          rateLimit: response?.status === 429,
          retryAfter: response?.headers.get('Retry-After'),
        })
      },
    },
  }))
}

export async function sendToChannel({
  channelId,
  payload,
}: {
  channelId: string
  payload: RESTPostAPIWebhookWithTokenJSONBody
}) {
  const client = createDiscordClient()

  await client(`/channels/${channelId}/messages`, {
    body: payload,
  })
}

export async function sendToDM({
  userId,
  payload,
}: {
  userId: string
  payload: RESTPostAPIWebhookWithTokenJSONBody
}) {
  const client = createDiscordClient()

  // Resolve (or create) the DM channel for this user, then send to it
  const dmChannel = await client<RESTPostAPICurrentUserCreateDMChannelResult>(
    '/users/@me/channels',
    {
      body: { recipient_id: userId } satisfies RESTPostAPICurrentUserCreateDMChannelJSONBody,
    },
  )

  await client(`/channels/${dmChannel.id}/messages`, {
    body: payload,
  })
}
