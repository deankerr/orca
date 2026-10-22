import { expect, test } from 'bun:test'

import type { Scan } from '#scans/extraction'

import { supersedes } from './current'
import type { CurrentScope } from './current'
import { currentTables, expectedCurrent, Retained } from './current.testing'
import type { CurrentTable } from './current.testing'
import * as endpoints from './currentEndpoints'
import * as models from './currentModels'
import type { Source } from './source'
import { hour, random, scan, sequence } from './testing'

const served = (model: string) => ({ model, provider: 'p1' })
const previous = scan(hour(0), {
  endpoints: { e1: served('kept'), e2: served('renamed'), e3: served('departed') },
  names: { renamed: 'Old', departed: 'Gone' },
})
const next = scan(hour(1), {
  endpoints: { e1: served('kept'), e2: served('renamed'), e4: served('arrived') },
  names: { renamed: 'New' },
})

const ids = (source: Source, scope: CurrentScope) =>
  models
    .derive(source, scope)
    .map(({ model_id }) => model_id)
    .toSorted()

test('each scope emits its share of a pair; a model departs with its last endpoint', () => {
  expect(ids({ previous, next }, 'full')).toEqual(['arrived', 'departed', 'kept', 'renamed'])
  expect(ids({ previous, next }, 'changes')).toEqual(['arrived', 'departed', 'renamed'])
  expect(ids({ previous, next }, 'departures')).toEqual(['departed'])
})

test('a departure carries last-present facts and, for endpoints, the first absent scan', () => {
  const [departed] = models.derive({ previous, next }, 'departures')
  expect(departed).toMatchObject({ model_id: 'departed', display_name: 'Gone', scan_at: hour(1) })

  const listed = scan(hour(0), { endpoints: { e1: { model: 'm1', provider: 'p1' } } })
  const [unlisted] = endpoints.derive({ previous: listed, next: scan(hour(1)) }, 'departures')
  expect(unlisted).toMatchObject({ endpoint_id: 'e1', scan_at: hour(1), unlisted_at: hour(1) })
})

test('a baseline states its complete population whatever scope it receives', () => {
  expect(ids({ previous: null, next }, 'departures')).toEqual(['arrived', 'kept', 'renamed'])
})

test('newer versions win; equal or older candidates leave the retained row', () => {
  expect(supersedes(null, { scan_at: hour(0) })).toBe(true)
  expect(supersedes({ scan_at: hour(0) }, { scan_at: hour(1) })).toBe(true)
  expect(supersedes({ scan_at: hour(1) }, { scan_at: hour(1) })).toBe(false)
  expect(supersedes({ scan_at: hour(1) }, { scan_at: hour(0) })).toBe(false)
})

/** Commit every record in a random order, assigning scopes as the queue worker would. */
function commitInRandomOrder(table: CurrentTable, scans: Scan[], seed: number) {
  const draw = random(seed)
  const records = scans
    .map((current, index) => ({ previous: scans[index - 1] ?? null, next: current }))
    .toSorted(() => draw() - 0.5)
  const retained = new Retained(table)
  const fullScans: string[] = []

  for (const source of records) {
    const behindFull = fullScans.some((scan_at) => scan_at > source.next.scan_at)
    let scope: CurrentScope = 'departures'

    if (!behindFull) {
      scope = draw() < 0.3 ? 'full' : 'changes'
    }

    if (scope === 'full' && source.previous !== null) {
      fullScans.push(source.next.scan_at)
    }

    retained.commit(source, scope)
  }

  return retained.facts()
}

test('any commit order converges when departures-only pairs lie behind a committed full pair', () => {
  for (const table of currentTables) {
    for (let seed = 0; seed < 300; seed += 1) {
      const scans = sequence(seed, 8)

      expect(commitInRandomOrder(table, scans, seed)).toEqual(expectedCurrent(table, scans))
    }
  }
})
