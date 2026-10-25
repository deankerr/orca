import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { endpointFields, toEndpoint, translateEndpointUpdate } from '@orca/backend/v5/endpoints'
import { modelFields, toModel, translateModelUpdate } from '@orca/backend/v5/models'
import { project } from '@orca/backend/v5/projection'

// Spike: one field declaration set translating complete entities and stored changes.
const [directory = '/tmp/v5-spike'] = process.argv.slice(2)

type EndpointRow = Parameters<typeof toEndpoint>[0]
type StatsRow = NonNullable<Parameters<typeof toEndpoint>[1]>
type EndpointEvent = Parameters<typeof translateEndpointUpdate>[0]
type ModelRow = Parameters<typeof toModel>[0]
type Model = ReturnType<typeof toModel>
type ModelEvent = Parameters<typeof translateModelUpdate>[0]

// oxlint-disable-next-line no-unnecessary-type-parameters -- Each call names the export it reads.
function load<T>(name: string): T {
  const value: unknown = JSON.parse(readFileSync(path.join(directory, name), 'utf-8'))
  // oxlint-disable-next-line no-unsafe-type-assertion -- Exports of the deployment's own validated tables.
  return value as T
}

function tally(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1)
}

const top = (counts: Map<string, number>) =>
  [...counts].toSorted(([, a], [, b]) => b - a).slice(0, 25)

// Complete entities: the declared fields must reproduce the deployed V5 snapshot.
const rows = new Map(load<EndpointRow[]>('endpoints.json').map((row) => [row.endpoint_id, row]))
const providerNames = new Map(
  load<{ provider_id: string; display_name: string }[]>('providers.json').map((row) => [
    row.provider_id,
    row.display_name,
  ]),
)
const [statsDocument] = load<{ rows: StatsRow[] }[]>('stats.json')
const stats = new Map((statsDocument?.rows ?? []).map((row) => [row.endpoint_id, row]))
let matched = 0
const mismatched: string[] = []

for (const expected of load<{ endpoints: { id: string }[] }>('snapshot.json').endpoints) {
  const row = rows.get(expected.id)
  const actual =
    row === undefined
      ? undefined
      : toEndpoint(row, stats.get(expected.id), providerNames.get(row.provider_id))

  if (isDeepStrictEqual(actual, expected)) {
    matched += 1
  } else {
    mismatched.push(expected.id)
  }
}

console.log('complete endpoints', { matched, mismatched: mismatched.length })

// Complete models; listing fields come from the snapshot because they are not declared.
const modelRows = new Map(load<ModelRow[]>('models.json').map((row) => [row.model_id, row]))
const modelMismatches: string[] = []
let modelsMatched = 0

for (const expected of load<{ models: Model[] }>('snapshot.json').models) {
  const row = modelRows.get(expected.id)
  const listing = {
    endpoints: expected.listed_endpoints,
    providerIds: new Set(expected.provider_ids),
  }
  const actual = row === undefined ? undefined : toModel(row, listing)

  if (isDeepStrictEqual(actual, expected)) {
    modelsMatched += 1
  } else {
    modelMismatches.push(expected.id)
  }
}

console.log('complete models', { matched: modelsMatched, mismatched: modelMismatches.length })

// Stored changes through the same declarations.
type Translation = ReturnType<typeof translateEndpointUpdate>

function report(
  label: string,
  events: { type: string; change_json: string }[],
  fields: Parameters<typeof project>[0],
  translateUpdate: (row: never) => Translation,
) {
  const changed = new Map<string, number>()
  const unresolved = new Map<string, number>()
  const ignored = new Map<string, number>()
  const outcomes = new Map<string, number>()
  const failures = new Map<string, number>()
  const examples = new Map<string, unknown>()

  for (const row of events) {
    try {
      if (row.type !== 'UPDATE') {
        const snapshot: unknown = JSON.parse(row.change_json)
        project(
          fields,
          typeof snapshot === 'object' && snapshot !== null && 'value' in snapshot
            ? snapshot.value
            : undefined,
        )
        tally(outcomes, `${row.type} projected`)
        continue
      }

      // oxlint-disable-next-line no-unsafe-type-assertion -- Rows are filtered to the translator's entity kind.
      const result = translateUpdate(row as never)
      for (const change of result.changes) {
        tally(changed, change.field)
        if (!examples.has(change.field)) {
          examples.set(change.field, change)
        }
      }
      for (const name of result.unresolved) {
        tally(unresolved, name)
      }
      for (const source of result.ignored) {
        tally(ignored, source.replaceAll(/\.\d+(?=\.|$)/gu, '.#'))
      }

      if (result.changes.length > 0) {
        tally(outcomes, 'UPDATE translated')
      } else if (result.unresolved.length > 0) {
        tally(outcomes, 'UPDATE unresolved only')
      } else {
        tally(outcomes, 'UPDATE without Contract change')
      }
    } catch (error) {
      tally(outcomes, `${row.type} failed`)
      tally(failures, error instanceof Error ? error.message.slice(0, 200) : String(error))
    }
  }

  console.log(`\n## ${label}`)
  console.log('outcomes', Object.fromEntries(outcomes))
  console.log('changed Contract fields', top(changed))
  console.log('unresolved Contract fields', top(unresolved))
  console.log('ignored source paths', top(ignored))
  console.log('failures', top(failures))
  console.log('examples', Object.fromEntries(examples))
}

report(
  'endpoint events',
  load<EndpointEvent[]>('events.json').filter((row) => row.entity_kind === 'endpoint'),
  endpointFields,
  translateEndpointUpdate,
)
report('model events', load<ModelEvent[]>('model-events.json'), modelFields, translateModelUpdate)
