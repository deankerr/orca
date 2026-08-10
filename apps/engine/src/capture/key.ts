// * Observation object keys. Temporal major, scope as a single path segment under that time.
// *
// * observedAt is an instant (not a calendar day): a second sample an hour later is a different key.
// * No plan file required; nothing is overwritten by "same day" semantics.
import * as DateTime from 'effect/DateTime'

/** Instant for R2 path segments: 2026-08-11T12-34-56Z (colons dashed). */
export const observedAtKey = (now: DateTime.Utc): string =>
  `${DateTime.formatIso(now).slice(0, 19)}Z`.replaceAll(':', '-')

/**
 * One path segment naming a model-variant scope.
 * permaslug `/` → `.` so the key stays one segment under observedAt.
 */
export const scopeKey = (permaslug: string, variant: string): string =>
  `${permaslug.replaceAll('/', '.')}.${variant}`

export const observationKey = (observedAt: string, scope: string): string =>
  `${observedAt}/${scope}.json.gz`

/** Catalog snapshot under the same temporal prefix (optional inventory, not a grid). */
export const catalogKey = (observedAt: string): string => `${observedAt}/catalog.json.gz`
