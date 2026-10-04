import type { JsonProfile, JsonTypeProfile, ValueProfile } from './profile'
import { numericSummary, profileRows, summarizeNumbers } from './summary'

export interface ViewOptions {
  /** Exact JSONPaths. Omission selects every field. */
  paths?: string[]
  /** Entries per distribution; defaults to five. Null retains every exact value. */
  valueLimit?: number | null
}

/** A projection of a complete profile. Counts and quantiles always use all observations. */
export function viewProfile(profile: JsonProfile, options: ViewOptions = {}) {
  const valueLimit = options.valueLimit === undefined ? 5 : options.valueLimit

  if (valueLimit !== null && (!Number.isSafeInteger(valueLimit) || valueLimit < 0)) {
    throw new RangeError('valueLimit must be a nonnegative integer or null')
  }

  const paths = options.paths === undefined ? null : new Set(options.paths)
  const fields = [{ none: 0, value: profile.root }, ...profileRows(profile)]
    .filter(({ value }) => paths === null || paths.has(value.path))
    .map(({ none, value }) => ({
      missing: none,
      path: value.path,
      population: value.population,
      types: value.types.map((branch) => viewBranch(branch, value, valueLimit)),
    }))

  return {
    fields,
    profile_format: 'json-record-profile-view-v1' as const,
    record_count: profile.record_count,
    view: { paths: options.paths ?? null, value_limit: valueLimit },
  }
}

export type ProfileView = ReturnType<typeof viewProfile>

function viewBranch(branch: JsonTypeProfile, value: ValueProfile, limit: number | null) {
  switch (branch.type) {
    case 'null': {
      return { ...branch }
    }
    case 'object': {
      return {
        count: branch.count,
        key_sets: distribution(branch.key_sets, limit),
        type: branch.type,
      }
    }
    case 'array': {
      return {
        count: branch.count,
        items_path: branch.items.path,
        length_summary: summarizeNumbers(
          branch.lengths.map(({ length, count }) => ({ count, value: length })),
        ),
        lengths: distribution(branch.lengths, limit),
        type: branch.type,
      }
    }
    case 'boolean':
    case 'number':
    case 'string': {
      return {
        count: branch.count,
        type: branch.type,
        values: distribution(
          branch.values,
          limit,
          (entry) => limit === null || typeof entry.value !== 'string' || entry.value.length <= 160,
        ),
        ...(branch.type === 'number' ? { summary: numericSummary(value) } : {}),
      }
    }
    default: {
      throw new Error('Unknown profile type')
    }
  }
}

/** Stable frequency ranking; omitted counts also cover long strings excluded from compact views. */
function distribution<T extends { count: number }>(
  entries: readonly T[],
  limit: number | null,
  include: (entry: T) => boolean = () => true,
) {
  const ranked = entries.filter(include).toSorted((left, right) => right.count - left.count)
  const values = limit === null ? ranked : ranked.slice(0, limit)

  return {
    complete: values.length === entries.length,
    distinct_count: entries.length,
    entries: values,
    omitted_distinct_count: entries.length - values.length,
    omitted_occurrence_count:
      entries.reduce((total, entry) => total + entry.count, 0) -
      values.reduce((total, entry) => total + entry.count, 0),
  }
}
