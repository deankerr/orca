/** A missing requirement flag never implies optional reasoning. */
export function reasoningLabel(supported: boolean | null, required: boolean | null) {
  if (required === true) {
    return 'Required'
  }
  if (supported === false) {
    return 'Unsupported'
  }
  if (supported === true) {
    return required === false ? 'Optional' : 'Supported'
  }
  return null
}

/** Known levels follow intensity; unfamiliar values remain visible at the end. */
export function orderEfforts(values: string[] | null) {
  const levels = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
  const rank = (value: string) => (levels.includes(value) ? levels.indexOf(value) : levels.length)
  return values?.toSorted((a, b) => rank(a) - rank(b)) ?? null
}
