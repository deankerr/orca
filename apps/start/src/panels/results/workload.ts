import type { Workload } from '@orca/pricing'

import { MAX_RATIO } from '#endpoints/scope'

const ratioFormat = new Intl.NumberFormat('en', {
  maximumSignificantDigits: 3,
  useGrouping: false,
})

/** A workload ratio to three significant digits, without grouping: `100`, `2.5`, `1000`. */
export function formatRatio(ratio: number): string {
  return ratioFormat.format(ratio)
}

/** A workload's hit rate as the whole percent the URL carries: 0.9 is 90. */
export function hitPercent(workload: Workload): number {
  return Math.round(workload.hitRate * 100)
}

/** The ratio and hit rate in short form, as the control's button shows them: `40:1 · 85%`. */
export function workloadNumbers(workload: Workload): string {
  return `${formatRatio(workload.ratio)}:1 · ${hitPercent(workload)}%`
}

/** The hit rate in words: `90% read from cache`, or `caching off` at 0. */
function hitRateText(workload: Workload): string {
  const percent = hitPercent(workload)

  return percent === 0 ? 'caching off' : `${percent}% read from cache`
}

/** The ratio and hit rate in words: `100 input tokens per output token, 90% read from cache`. */
export function workloadDescription(workload: Workload): string {
  const ratio = formatRatio(workload.ratio)

  return `${ratio} input ${ratio === '1' ? 'token' : 'tokens'} per output token, ${hitRateText(workload)}`
}

/** The workload control's accessible name, the numbers of its button in words: `Workload: 100 to 1 input to output, 90% cache hits`. */
export function workloadButtonName(workload: Workload): string {
  return `Workload: ${formatRatio(workload.ratio)} to 1 input to output, ${hitPercent(workload)}% cache hits`
}

/** The Cost column header's tooltip, which says what the figures are under the current workload. */
export function costHint(workload: Workload): string {
  return `Cost per million tokens for this workload: ${workloadDescription(workload)}`
}

/** A typed ratio's digits: whole or decimal, with no sign or exponent, and the decimal point may trail or lead. */
const RATIO_TEXT = /^(?:\d+\.?\d*|\.\d+)$/u

/** The ratio a typed value means, or null while it is empty, malformed, not above zero, or above `MAX_RATIO`. */
export function parseRatio(text: string): number | null {
  const trimmed = text.trim()

  if (!RATIO_TEXT.test(trimmed)) {
    return null
  }

  const ratio = Number(trimmed)

  return ratio > 0 && ratio <= MAX_RATIO ? ratio : null
}

/** A typed hit rate's digits: a whole number. */
const PERCENT_TEXT = /^\d{1,3}$/u

/** The whole percent a typed value means, or null while it is empty, malformed, or outside 0 to 100. */
export function parseHitPercent(text: string): number | null {
  const trimmed = text.trim()

  if (!PERCENT_TEXT.test(trimmed)) {
    return null
  }

  const percent = Number(trimmed)

  return percent <= 100 ? percent : null
}
