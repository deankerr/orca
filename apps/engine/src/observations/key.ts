// * Observation object keys. Kind prefix, then temporal major.
import * as DateTime from 'effect/DateTime'

/** Instant for R2 path segments: 2026-08-11T12-34-56Z (colons dashed). */
export const observedAtKey = (now: DateTime.Utc): string =>
  `${DateTime.formatIso(now).slice(0, 19)}Z`.replaceAll(':', '-')

/**
 * One path segment naming a model-variant scope.
 * permaslug `/` → `_` so the key stays one segment under observedAt
 * (underscores do not appear in model slugs; dots do).
 */
export const scopeKey = (permaslug: string, variant: string): string =>
  `${permaslug.replaceAll('/', '_')}.${variant}`

/** Endpoints body: endpoints/{observedAt}/{scope}.json.gz */
export const observationKey = (observedAt: string, scope: string): string =>
  `endpoints/${observedAt}/${scope}.json.gz`

/** Catalog inventory: catalogs/{observedAt}.json.gz */
export const catalogKey = (observedAt: string): string => `catalogs/${observedAt}.json.gz`
