import type { Scan } from '#scans/extraction'

/** A record's source scans: a pair compares previous → next; a baseline has no previous scan. */
export type Source = { previous: Scan | null; next: Scan }

export type Collections = Omit<Scan, 'scan_at'>

const empty: Collections = {
  endpoints: new Map(),
  models: new Map(),
  providers: new Map(),
  stats: [],
}

/** A baseline compares against nothing, so every entity it observes is new. */
export function previousCollections(source: Source): Collections {
  return source.previous ?? empty
}
