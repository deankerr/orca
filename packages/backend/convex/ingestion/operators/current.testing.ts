/** Current-entity reference model shared by tests. Two dots keep it out of deployments. */
import type { Scan } from '#scans/extraction'

import { supersedes } from './current'
import type { CurrentScope } from './current'
import * as endpoints from './currentEndpoints'
import * as models from './currentModels'
import * as providers from './currentProviders'
import type { Source } from './source'

type Row = { scan_at: string }

export type CurrentTable<R extends Row = Row> = {
  name: string
  derive: (source: Source, scope: CurrentScope) => R[]
  key: (row: R) => string
}

function eraseRowType<R extends Row>(definition: CurrentTable<R>): CurrentTable {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Each table only receives its own rows back.
  return definition as unknown as CurrentTable
}

export const currentTables: CurrentTable[] = [
  eraseRowType({ name: 'models', derive: models.derive, key: (row) => row.model_id }),
  eraseRowType({ name: 'providers', derive: providers.derive, key: (row) => row.provider_id }),
  eraseRowType({ name: 'endpoints', derive: endpoints.derive, key: (row) => row.endpoint_id }),
]

/** Retained rows keyed by identity, merged as commits do. */
export class Retained<R extends Row = Row> {
  readonly rows = new Map<string, R>()
  readonly table: CurrentTable<R>

  constructor(table: CurrentTable<R>) {
    this.table = table
  }

  commit(source: Source, scope: CurrentScope) {
    for (const row of this.table.derive(source, scope)) {
      const key = this.table.key(row)

      if (supersedes(this.rows.get(key) ?? null, row)) {
        this.rows.set(key, row)
      }
    }
  }

  facts() {
    return withoutVersions(this.table, [...this.rows.values()])
  }
}

/** Last-present facts for every entity seen, unlisted at the first absent scan after that presence. */
export function expectedCurrent<R extends Row>(table: CurrentTable<R>, scans: Scan[]) {
  const retained = new Retained(table)

  for (const [index, scan] of scans.entries()) {
    const following = scans[index + 1]

    retained.commit({ previous: null, next: scan }, 'full')

    if (following !== undefined) {
      retained.commit({ previous: scan, next: following }, 'departures')
    }
  }

  return retained.facts()
}

/** Versions record which commit won, not the facts; compare facts alone. */
function withoutVersions<R extends Row>(table: CurrentTable<R>, rows: R[]) {
  return new Map(rows.map((row) => [table.key(row), { ...row, scan_at: undefined }]))
}
