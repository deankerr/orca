// Anonymous change-value formatting. Pricing has its own module.

import * as R from 'remeda'

export function splitPath(path: string): { category: string | null; key: string } {
  const dotIndex = path.indexOf('.')
  if (dotIndex === -1) {
    return { category: null, key: path }
  }
  return { category: path.slice(0, dotIndex), key: path.slice(dotIndex + 1) }
}

export function fmtValue(value: unknown): string {
  if (!R.isDefined(value)) {
    return 'null'
  }
  if (R.isNumber(value)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 6 })
  }
  if (R.isString(value)) {
    return value
  }
  if (R.isBoolean(value)) {
    return String(value)
  }
  return JSON.stringify(value)
}

export function computeDelta(
  before: unknown,
  after: unknown,
): { pct: number; isUp: boolean; isGood: boolean } | null {
  if (!R.isNumber(before) || !R.isNumber(after) || before === 0) {
    return null
  }

  const pct = ((after - before) / before) * 100
  const isUp = after > before
  return { pct, isUp, isGood: isUp }
}
