/** Pure option parsing and pass/fail rules for the ingestion load test. */

/** Matches `MAX_PARALLELISM` in `packages/backend/convex/ingestion/pool.ts`. */
const MAX_PARALLELISM = 100

export type Options = {
  allowExisting: boolean
  deployment: string
  hours: number
  parallelism: number
  poll: number
  timeout: number
}

export type RawOptions = {
  allowExisting?: boolean
  deployment: string
  hours: string
  parallelism: string
  poll: string
  timeout: string
}

function integer(label: string, text: string, min: number, max: number): number {
  const value = /^\d+$/u.test(text.trim()) ? Number(text) : Number.NaN

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer from ${min} to ${max}, got "${text}"`)
  }

  return value
}

/** Validate every numeric option before anything touches the deployment. */
export function parseOptions(raw: RawOptions): Options {
  return {
    allowExisting: raw.allowExisting === true,
    deployment: raw.deployment,
    hours: integer('--hours', raw.hours, 1, 24 * 365),
    parallelism: integer('--parallelism', raw.parallelism, 1, MAX_PARALLELISM),
    poll: integer('--poll', raw.poll, 1, 3600),
    timeout: integer('--timeout', raw.timeout, 1, 24 * 60),
  }
}

export type RunOutcome = {
  completionLostLogged: number
  failedRecords: number
  logsStoppedEarly: boolean
  occExhausted: number
  stillOpen: number
  timedOut: boolean
}

/** Reasons the run failed; an empty list means it passed. */
export function findProblems(outcome: RunOutcome): string[] {
  const problems: [boolean, string][] = [
    [outcome.timedOut, 'timed out before registration finished and records settled'],
    [outcome.stillOpen > 0, 'records still pending, queued or withdrawing'],
    [outcome.failedRecords > 0, `${outcome.failedRecords} failed records`],
    [outcome.occExhausted > 0, `${outcome.occExhausted} OCC-exhausted executions`],
    [outcome.completionLostLogged > 0, `${outcome.completionLostLogged} completion lost`],
    [
      outcome.logsStoppedEarly,
      'log stream ended before the run finished, so contention is unverified',
    ],
  ]
  return problems.filter(([failed]) => failed).map(([, message]) => message)
}
