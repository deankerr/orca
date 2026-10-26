/** Contention evidence from Convex function log events (`convex logs --jsonl`). */

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

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {}
}

function parseEvent(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()

  if (!trimmed.startsWith('{')) {
    return null
  }

  try {
    return record(JSON.parse(trimmed))
  } catch {
    return null
  }
}

function functionStats(report: ContentionReport, event: Record<string, unknown>) {
  const path =
    typeof event.componentPath === 'string' && event.componentPath !== ''
      ? `${event.componentPath}:`
      : ''

  const key = `${path}${String(event.identifier)}`

  const stats = report.functions[key] ?? {
    executions: 0,
    occExhausted: 0,
    occRetries: 0,
    otherErrors: 0,
  }

  report.functions[key] = stats

  return stats
}

function classify(event: Record<string, unknown>, error: string | null) {
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

  if (event.kind !== 'Completion' || typeof event.identifier !== 'string') {
    return
  }

  const stats = functionStats(report, event)
  stats.executions += 1
  const error = typeof event.error === 'string' ? event.error : null
  const outcome = classify(event, error)

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
