import { REST, RESTEvents, RequestMethod } from '@discordjs/rest'
import type { RESTOptions } from '@discordjs/rest'
import { z } from 'zod'

const zSnowflake = z.string().regex(/^\d{17,20}$/u)

/** Callers own the message; the sender reads only the thread a forum send creates. */
const zMessagePayload = z.object({ thread_name: z.string().optional() }).catchall(z.json())

/** Discord's message object, kept whole; receipts route later edits by its identity. */
export const zMessage = z.object({ channel_id: zSnowflake, id: zSnowflake }).catchall(z.json())

/** Admission and transmission must accept the same JSON values. */
export function parseMessagePayload(payload: string) {
  return zMessagePayload.parse(JSON.parse(payload))
}

export class ExpiredError extends Error {
  constructor() {
    super('Discord request expired before transmission')
    this.name = 'ExpiredError'
  }
}

export function parseWebhookUrl(value: string) {
  const parsed = new URL(value)

  const match = /^\/api(?:\/v\d+)?\/webhooks\/(?<id>\d{17,20})\/(?<token>[\w-]+)\/?$/u.exec(
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
/** A stored job message: each kind carries exactly the fields its request needs. */
type Operation =
  | { kind: 'send'; payload: string }
  | { kind: 'edit'; messageId: string; payload: string; threadId?: string }
  | { kind: 'delete'; messageId: string; threadId?: string }

export function createDiscord() {
  const deadlines = new Map<string, number>()
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: The SDK's browser build declares undici types, but its documented makeRequest hook accepts native fetch for JSON requests.
  const nativeFetch = fetch as RESTOptions['makeRequest']

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
    async request({
      url: webhookUrl,
      operation,
      expiresAt,
    }: {
      url: string
      operation: Operation
      expiresAt: number
    }) {
      const webhook = parseWebhookUrl(webhookUrl)
      const url = new URL(webhook.url)

      const route =
        operation.kind === 'send'
          ? webhook.route
          : (`${webhook.route}/messages/${zSnowflake.parse(operation.messageId)}` as const)

      const body = operation.kind === 'delete' ? undefined : parseMessagePayload(operation.payload)

      url.pathname = `/api/v10${route}`

      if (operation.kind !== 'send' && operation.threadId !== undefined) {
        url.searchParams.set('thread_id', zSnowflake.parse(operation.threadId))
      }

      if (operation.kind !== 'delete') {
        url.searchParams.set('wait', 'true')
        url.searchParams.set('with_components', 'true')
      }

      const fullUrl = url.toString()

      if (deadlines.has(fullUrl)) {
        throw new Error('Requests to a webhook must run sequentially')
      }

      deadlines.set(fullUrl, z.number().parse(expiresAt))

      try {
        const result = await rest.request({
          auth: false,
          body,
          fullRoute: route,
          method: {
            delete: RequestMethod.Delete,
            edit: RequestMethod.Patch,
            send: RequestMethod.Post,
          }[operation.kind],
          query: url.searchParams,
        })

        return operation.kind === 'delete' ? null : zMessage.parse(result)
      } finally {
        deadlines.delete(fullUrl)
      }
    },
  }
}
