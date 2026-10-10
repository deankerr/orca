import { REST, RESTEvents, RequestMethod } from '@discordjs/rest'
import type { RESTOptions } from '@discordjs/rest'
import { z } from 'zod'

const zObject = z.record(z.string(), z.json())
const zSnowflake = z.string().regex(/^\d{17,20}$/)

/** Admission and transmission must accept the same JSON values. */
export function parseMessagePayload(payload: string) {
  return zObject.parse(JSON.parse(payload))
}

export class ExpiredError extends Error {
  constructor() {
    super('Discord request expired before transmission')
    this.name = 'ExpiredError'
  }
}

export function parseWebhookUrl(value: string) {
  const parsed = new URL(value)
  const match = /^\/api(?:\/v\d+)?\/webhooks\/(?<id>\d{17,20})\/(?<token>[\w-]+)\/?$/.exec(
    parsed.pathname,
  )

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'discord.com' ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !match?.groups
  ) {
    throw new Error('Expected an HTTPS Discord webhook URL')
  }

  const route = `/webhooks/${match.groups.id}/${match.groups.token}` as const
  const url = new URL(`https://discord.com/api/v10${route}`)
  const threadId = parsed.searchParams.get('thread_id')

  if (threadId !== null) {
    url.searchParams.set('thread_id', zSnowflake.parse(threadId))
  }

  return { resourceKey: match.groups.id, route, url: url.toString() }
}

/** Only destination/credential failures condemn a registration, not a bad message. */
export function invalidatesWebhook(error: { code: string | number }) {
  // Discord: Unknown Webhook / Invalid Webhook Token. Generic 403/404 responses
  // can describe a message or thread; they are not evidence the webhook is dead.
  return error.code === 10_015 || error.code === 50_027
}

/** Share one SDK client across an action's lanes so Discord's global limits are shared. */
export function createDiscord() {
  const deadlines = new Map<string, number>()
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The SDK's browser build declares undici types, but its documented makeRequest hook accepts native fetch for JSON requests.
  const nativeFetch = fetch as unknown as RESTOptions['makeRequest']
  const rest = new REST({
    handlerSweepInterval: 0,
    hashSweepInterval: 0,
    makeRequest: async (url, options) => {
      const expiresAt = deadlines.get(url)

      // This hook runs after every SDK wait, including retries and bucket cooldowns.
      if (expiresAt === undefined || Date.now() >= expiresAt) {
        throw new ExpiredError()
      }

      return await nativeFetch(url, { ...options, redirect: 'error' })
    },
  })

  rest.on(RESTEvents.RateLimited, ({ scope, global, retryAfter }) => {
    console.warn('Discord rate limit', { global, retryAfter, scope })
  })

  return {
    async request(input: {
      url: string
      operation: 'send' | 'edit' | 'delete'
      payload?: string
      messageId?: string
      threadId?: string
      expiresAt: number
    }) {
      const webhook = parseWebhookUrl(input.url)
      const url = new URL(webhook.url)
      const route =
        input.operation === 'send'
          ? webhook.route
          : (`${webhook.route}/messages/${zSnowflake.parse(input.messageId)}` as const)
      const body =
        input.operation === 'delete' ? undefined : parseMessagePayload(input.payload ?? '')

      url.pathname = `/api/v10${route}`

      if (input.operation !== 'send' && input.threadId !== undefined) {
        url.searchParams.set('thread_id', zSnowflake.parse(input.threadId))
      }

      if (input.operation !== 'delete') {
        url.searchParams.set('wait', 'true')
        url.searchParams.set('with_components', 'true')
      }

      const fullUrl = url.toString()

      if (deadlines.has(fullUrl)) {
        throw new Error('Requests to a webhook must run sequentially')
      }

      deadlines.set(fullUrl, z.number().parse(input.expiresAt))

      try {
        const result = await rest.request({
          auth: false,
          body,
          fullRoute: route,
          method: {
            delete: RequestMethod.Delete,
            edit: RequestMethod.Patch,
            send: RequestMethod.Post,
          }[input.operation],
          query: url.searchParams,
        })

        return input.operation === 'delete' ? null : zObject.parse(result)
      } finally {
        deadlines.delete(fullUrl)
      }
    },
  }
}
