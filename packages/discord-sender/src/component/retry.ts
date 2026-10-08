import { isNullish } from 'remeda'
import { z } from 'zod'

import type { ResponseSnapshot } from './protocol'

// Custom HTTP receivers may use an IMF-fixdate instead of Discord's seconds.
// Date.parse alone also accepts malformed durations such as '-1' as calendar dates.
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/

const zRateLimit = z.object({
  global: z.boolean().optional().catch(false),
  retry_after: z.number().nonnegative().nullish().catch(null),
})

export type Cooldown = { availableAt: number; scope: 'webhook' | 'global' }

export type ResponseDecision =
  | { cooldowns: Cooldown[]; kind: 'succeeded' | 'failed' }
  | { cooldowns: Cooldown[]; kind: 'retry'; retryAt: number }

/** Translate a single HTTP result into scheduling facts, without owning a job. */
export function classifyResponse(
  response: ResponseSnapshot,
  attempt: number,
  now: number,
): ResponseDecision {
  const cooldowns: Cooldown[] = []
  const retry = retryAt(response, attempt, now)
  const bucket = bucketReadyAt(response, now)

  if (response.status === 429 && retry !== null) {
    // A 429 blocks a receiver scope, not only the message that encountered it.
    // Switching jobs must still respect this gate. A global response can carry
    // ordinary route headers too, so its two independent gates may both matter.
    if (isGlobalRateLimit(response)) {
      cooldowns.push({ availableAt: retry, scope: 'global' })

      if (bucket !== null) {
        cooldowns.push({ availableAt: bucket, scope: 'webhook' })
      }
    } else {
      cooldowns.push({ availableAt: Math.max(retry, bucket ?? 0), scope: 'webhook' })
    }
  } else if (bucket !== null) {
    // A successful send can consume the last slot. A terminal rejection can too.
    // Preserve the scheduling hint independently of the message's final result.
    cooldowns.push({ availableAt: bucket, scope: 'webhook' })
  }

  if (retry !== null) {
    // Network failures and 5xx responses delay this message only, unless the
    // response separately provides an exhausted-bucket hint above.
    return { cooldowns, kind: 'retry', retryAt: retry }
  }

  return {
    cooldowns,
    kind:
      response.status !== null && response.status >= 200 && response.status < 300
        ? 'succeeded'
        : 'failed',
  }
}

/** Query parameters select threads/options; they do not create a new webhook. */
export function webhookResourceKey(address: string): string {
  const url = new URL(address)
  url.search = ''
  url.hash = ''
  return url.href
}

function seconds(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  const parsed = Number(value)
  // Clamp before conversion so even an absurd receiver hint cannot become Infinity.
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.min(parsed, Number.MAX_SAFE_INTEGER / 1000) * 1000
    : undefined
}

/** Discord's 429 retry_after is a duration in seconds, including fractional seconds. */
export function retryAt(response: ResponseSnapshot, attempt: number, now: number): number | null {
  if (response.status !== null && response.status !== 429 && response.status < 500) {
    return null
  }
  // The deadline, rather than an arbitrary attempt count, bounds retrying. Keep a
  // minimum delay even for a malformed/zero 429 hint so custom receivers cannot spin.
  const fallback = Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6))
  if (response.status !== 429) {
    return now + fallback
  }

  const body = readRateLimit(response.body)
  const bodyDelay = isNullish(body.retry_after) ? undefined : seconds(String(body.retry_after))
  const header = response.headers['retry-after']
  const headerDelay =
    seconds(header) ??
    (header && HTTP_DATE.test(header) ? Math.max(0, Date.parse(header) - now) : undefined)
  const hints = [bodyDelay, headerDelay].filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  )
  // A shared-resource 429 can have remaining > 0 and a different bucket reset.
  // Retry-After governs this request; reset-after is only a fallback when absent.
  const delay =
    hints.length > 0
      ? Math.max(...hints)
      : (seconds(response.headers['x-ratelimit-reset-after']) ?? fallback)
  // A one-second floor avoids queue churn for zero/near-zero hints. Waiting longer
  // than Discord requests is safe; the job deadline still bounds the continuation.
  return now + Math.max(1000, delay)
}

/** An exhausted route bucket applies even when the request itself succeeded. */
export function bucketReadyAt(response: ResponseSnapshot, now: number): number | null {
  if (response.headers['x-ratelimit-remaining'] !== '0') {
    return null
  }
  const delay = seconds(response.headers['x-ratelimit-reset-after'])
  return delay !== undefined && delay > 0 ? now + delay : null
}

function isGlobalRateLimit(response: ResponseSnapshot): boolean {
  return (
    readRateLimit(response.body).global === true ||
    response.headers['x-ratelimit-global']?.trim().toLowerCase() === 'true' ||
    response.headers['x-ratelimit-scope']?.trim().toLowerCase() === 'global'
  )
}

function readRateLimit(body: string): z.infer<typeof zRateLimit> {
  try {
    return zRateLimit.parse(JSON.parse(body))
  } catch {
    // Custom receivers and upstream proxies may not provide a Discord JSON body.
    return {}
  }
}
