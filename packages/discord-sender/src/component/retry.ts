import { z } from 'zod'

import type { ResponseSnapshot } from './transport'

// Custom HTTP receivers may use an IMF-fixdate instead of Discord's seconds.
// Date.parse alone also accepts malformed durations such as '-1' as calendar dates.
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/

const zRateLimit = z.object({ retry_after: z.number().nonnegative().optional() })

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

  let bodyDelay: number | undefined
  try {
    const body = zRateLimit.safeParse(JSON.parse(response.body))
    bodyDelay =
      body.success && body.data.retry_after !== undefined
        ? seconds(String(body.data.retry_after))
        : undefined
  } catch {
    // Non-JSON rate-limit responses still have usable headers, or use backoff.
  }
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
  // than Discord requests is safe; the input deadline still bounds the continuation.
  return now + Math.max(1000, delay)
}

/** Avoid a predictable 429 while this recipient job drains its ordered messages. */
export function bucketReadyAt(response: ResponseSnapshot, now: number): number | null {
  if (response.headers['x-ratelimit-remaining'] !== '0') {
    return null
  }
  const delay = seconds(response.headers['x-ratelimit-reset-after'])
  return delay !== undefined && delay > 0 ? now + delay : null
}

// Design boundary: these hints govern one recipient chain. Shared/global Discord
// buckets and overlapping inputs are not coordinated yet; each chain honors its own
// 429 before resuming. A future shared gate should be justified by observed traffic.
