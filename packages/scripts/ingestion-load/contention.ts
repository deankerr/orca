/** Contention evidence from Convex function log events (`convex logs --jsonl`). */
import { z } from 'zod'

const OCC_PATTERN = /changed while this mutation was being run|write conflict|\bOCC\b/iu
const RETRIES_EXHAUSTED_PATTERN = /retried too many times|too many (?:retries|conflicts)/iu

const LINE_PATTERNS = {
  completionLost: /completion lost/iu,
  requestFailed: /\[ingestion\] request failed/iu,
} as const

export type FunctionContention = {
  /** Executions that failed and will be retried, or that carried OCC info. */
  occRetries: number
  /** Executions that failed on OCC with no retry remaining, or reported retry exhaustion. */
  occExhausted: number
  /** Other failed executions. */
  otherErrors: number
  executions: number
}

export type ContentionReport = {
  completionLost: number
  events: number
  functions: Record<string, FunctionContention>
  requestFailed: number
  /** First few distinct error messages, for diagnosis. */
  sampleErrors: string[]
}

const SAMPLE_LIMIT = 5

export function emptyReport(): ContentionReport {
  return { completionLost: 0, events: 0, functions: {}, requestFailed: 0, sampleErrors: [] }
}

/** A function execution; other event kinds carry no contention evidence. */
const Completion = z.object({
  componentPath: z.string().nullish(),
  error: z.string().nullish(),
  identifier: z.string(),
  kind: z.literal('Completion'),
  occInfo: z.json().nullish(),
  willRetry: z.boolean().optional(),
})

type Completion = z.infer<typeof Completion>

/** Log events are JSON objects; CLI banners and partial lines are not. */
function parseEvent(line: string): z.infer<ReturnType<typeof z.json>> | null {
  const trimmed = line.trim()

  if (!trimmed.startsWith('{')) {
    return null
  }

  try {
    return z.json().parse(JSON.parse(trimmed))
  } catch {
    return null
  }
}

function functionStats(report: ContentionReport, event: Completion) {
  const path =
    event.componentPath === undefined || event.componentPath === null || event.componentPath === ''
      ? ''
      : `${event.componentPath}:`

  const key = `${path}${event.identifier}`

  const stats = report.functions[key] ?? {
    executions: 0,
    occExhausted: 0,
    occRetries: 0,
    otherErrors: 0,
  }

  report.functions[key] = stats

  return stats
}

function classify(event: Completion, error: string | null) {
  const occ = (event.occInfo ?? null) !== null || (error !== null && OCC_PATTERN.test(error))

  if (error === null && !occ) {
    return 'ok'
  }

  if (error !== null && RETRIES_EXHAUSTED_PATTERN.test(error)) {
    return 'occExhausted'
  }

  if (!occ) {
    return 'otherErrors'
  }

  return event.willRetry === true ? 'occRetries' : 'occExhausted'
}

function sampleError(report: ContentionReport, error: string) {
  const message = error.split('\n')[0]?.slice(0, 300) ?? error

  if (report.sampleErrors.length < SAMPLE_LIMIT && !report.sampleErrors.includes(message)) {
    report.sampleErrors.push(message)
  }
}

/** Fold one log line into the report; non-JSON lines (CLI banners) are ignored. */
export function addLogLine(report: ContentionReport, line: string): void {
  const event = parseEvent(line)

  if (event === null) {
    return
  }

  report.events += 1
  report.requestFailed += LINE_PATTERNS.requestFailed.test(line) ? 1 : 0
  report.completionLost += LINE_PATTERNS.completionLost.test(line) ? 1 : 0

  const completion = Completion.safeParse(event)

  if (!completion.success) {
    return
  }

  const stats = functionStats(report, completion.data)
  stats.executions += 1
  const error = completion.data.error ?? null
  const outcome = classify(completion.data, error)

  if (outcome !== 'ok') {
    stats[outcome] += 1
  }

  if (error !== null) {
    sampleError(report, error)
  }
}

export function totals(report: ContentionReport) {
  const stats = Object.values(report.functions)

  const sum = (key: keyof FunctionContention) =>
    stats.reduce((total, entry) => total + entry[key], 0)

  return {
    executions: sum('executions'),
    occExhausted: sum('occExhausted'),
    occRetries: sum('occRetries'),
    otherErrors: sum('otherErrors'),
  }
}
