import type { JsonProfile, ValueProfile } from './profile'

export type ProfileRow = { none: number; value: ValueProfile }

export function profileRows(profile: JsonProfile): ProfileRow[] {
  const rows: ProfileRow[] = []

  function visit(value: ValueProfile, none = 0): void {
    if (value !== profile.root) {
      rows.push({ none, value })
    }

    for (const branch of value.types) {
      if (branch.type === 'object') {
        for (const field of branch.fields) {
          visit(field, field.none)
        }
      } else if (branch.type === 'array') {
        visit(branch.items)
      }
    }
  }

  visit(profile.root)
  return rows
}

export function distinctValues(value: ValueProfile): number {
  let total = 0

  for (const branch of value.types) {
    if (branch.type === 'null') {
      total += 1
    } else if ('values' in branch) {
      total += branch.values.length
    }
  }

  return total
}

/** Weighted nearest-rank quantiles of observed numeric values, without coercing strings. */
export function numericSummary(value: ValueProfile) {
  const branch = value.types.find((branch) => branch.type === 'number')

  if (branch === undefined || !('values' in branch)) {
    return null
  }

  return summarizeNumbers(
    branch.values.flatMap(({ count, value }) =>
      typeof value === 'number' ? [{ count, value }] : [],
    ),
  )
}

export function summarizeNumbers(frequencies: { value: number; count: number }[]) {
  const values = frequencies.toSorted((left, right) => left.value - right.value)

  const [first] = values
  const last = values.at(-1)

  if (first === undefined || last === undefined) {
    return null
  }

  const count = values.reduce((total, entry) => total + entry.count, 0)

  function quantile(fraction: number): number {
    const rank = Math.max(1, Math.ceil(count * fraction))
    let seen = 0

    for (const entry of values) {
      seen += entry.count

      if (seen >= rank) {
        return entry.value
      }
    }

    return last?.value ?? 0
  }

  return { count, max: last.value, median: quantile(0.5), min: first.value, p95: quantile(0.95) }
}
