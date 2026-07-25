// * Analysis helper: key/value frequency analysis of the raw records of one entity in one
// * pass, so we can see what every field actually contains before deciding how to canonicalize
// * it — always-null fields, closed value sets, booleans that are never false, and so on.
// * Reads the raw records (not the canonical ones) so unknown keys show up too. Nested objects
// * are recursed into as dotted paths; ids and bulk text are summarised by shape (null /
// * empty / length), never dumped.
// *
// * Fields are sorted into sections by what kind of thing they turned out to be, because the
// * section a field lands in is itself the finding: an invariant is a field with nothing to
// * model, an enum is a value set we can rely on, an opaque field is one only shape describes.
// * Run: bun run fields [--entity models|providers|endpoints] [--pass <captured_at>]
import { parseArgs } from 'node:util'

import { mirroredPasses, readPass } from '../canonicalize/pass.ts'

const { values: args } = parseArgs({
  options: { entity: { type: 'string' }, pass: { type: 'string' } },
})

const outputDir = new URL('../../output/', import.meta.url).pathname
const MAX_DEPTH = 4
// * beyond this a field is an id or free text, not a value set worth enumerating
const MAX_LISTED = 30
const MAX_VALUE_CHARS = 60
// * a container with more distinct child keys than this is a dictionary, not a shape
const MAX_KEYS = 25
// * uuids are identity, never a value set — low cardinality only means most rows are null
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Pass = Awaited<ReturnType<typeof readPass>>
type Entity = {
  identity: string
  ignored: Record<string, string>
  records: (pass: Pass) => unknown[]
}

// * the three entities the deduped pass carries, each with its natural key and the paths we
// * drop (with their children) and why. Dropped paths are still counted and listed at the end
// * of the report, so nothing is silently missing.
const ENTITIES: Record<string, Entity> = {
  endpoints: {
    identity: 'id',
    ignored: {
      'pricing.display_pricing':
        'byte-identical duplicate of the top-level `display_pricing` (verified) — analysed there instead',
      routing_heuristics_by_tier: 'volatile telemetry — belongs to the analytics pipeline',
      stats: 'volatile telemetry — belongs to the analytics pipeline',
      statsByTier: 'volatile telemetry — belongs to the analytics pipeline',
      status_heuristics: 'volatile telemetry — belongs to the analytics pipeline',
      status_heuristics_1d: 'volatile telemetry — belongs to the analytics pipeline',
      status_heuristics_5m: 'volatile telemetry — belongs to the analytics pipeline',
    },
    records: (pass: Pass) => pass.scopes.flatMap((scope) => scope.endpoints),
  },
  models: {
    identity: 'slug',
    ignored: {
      reasoning_config:
        'byte-for-byte identical to `features.reasoning_config` on every record — analysed there instead',
    },
    records: (pass: Pass) => pass.scopes.map((scope) => scope.model),
  },
  providers: {
    identity: 'slug',
    ignored: {},
    records: (pass: Pass) => pass.providers,
  },
}

const label = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === '') {
    return '`""`'
  }
  return `\`${text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text}\``
}

// * frequency table, most common first
const frequencies = (values: unknown[]) => {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = typeof value === 'string' ? value : JSON.stringify(value)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].toSorted(([, a], [, b]) => b - a)
}

const stats = (numbers: number[]) => {
  const sorted = numbers.toSorted((a, b) => a - b)
  return {
    max: sorted.at(-1) ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    min: sorted[0] ?? 0,
  }
}

// * what a field turned out to be. The order here is the order of the report: invariants and
// * enums are decisions we can act on, opaque fields are ones we can only describe.
type Category = 'invariant' | 'boolean' | 'enum' | 'number' | 'array' | 'object' | 'opaque'

const categorise = (options: {
  distinct: number
  kinds: Set<string>
  uuids: boolean
}): Category => {
  // * at most one distinct value ever observed — including "always null" and "always 0 when
  // * set at all", which are the same finding wearing different clothes
  if (options.distinct <= 1) {
    return 'invariant'
  }
  if (options.kinds.has('object')) {
    return 'object'
  }
  if (options.kinds.has('array')) {
    return 'array'
  }
  if (options.kinds.has('boolean')) {
    return 'boolean'
  }
  if (options.distinct <= MAX_LISTED && !options.uuids) {
    return 'enum'
  }
  return options.kinds.has('number') ? 'number' : 'opaque'
}

const summarise = (path: string, values: unknown[], total: number) => {
  const present = values.length
  const nulls = values.filter((value) => value === null).length
  const set = values.filter((value) => value !== null)
  // * null is a value, not a gap — upstream uses it as a real state and it belongs in the
  // * frequency tables alongside everything else. Absence (no key at all) is the gap.
  const distinct = frequencies(values)

  const kinds = new Set(
    set.map((value) => {
      if (Array.isArray(value)) {
        return 'array'
      }
      return isPlainObject(value) ? 'object' : typeof value
    }),
  )
  const uuids = set.some((value) => typeof value === 'string' && UUID.test(value))

  const category = categorise({ distinct: distinct.length, kinds, uuids })

  return { absent: total - present, category, distinct, nulls, path, present, set, uuids, values }
}

// * value/count rows for a frequency list, with a tail row when it runs past the cap
const countRows = (counts: Array<[string, number]>, limit: number) => [
  ...counts.slice(0, limit).map(([value, count]) => [label(value), `${count}`]),
  ...(counts.length > limit ? [[`… +${counts.length - limit} more`, '']] : []),
]

const table = (header: string[], rows: string[][]) => [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
  '',
]

const section = (title: string, blurb: string, body: string[]) =>
  body.length > 0 ? [`## ${title}`, '', blurb, '', ...body] : []

const captured_at = args.pass ?? mirroredPasses().at(-1)
if (captured_at === undefined) {
  throw new Error('no mirrored passes — run `bun run mirror` in apps/capture first')
}

const pass = await readPass(captured_at)

// * one report per entity: collect its raw records, deduped by natural key, then walk every
// * path in them
const analyse = (name: string, entity: Entity) => {
  const ignoredBy = (path: string) =>
    Object.keys(entity.ignored).find((root) => path === root || path.startsWith(`${root}.`))

  const records = new Map<string, Record<string, unknown>>()
  for (const record of entity.records(pass)) {
    const key = isPlainObject(record) ? record[entity.identity] : undefined
    if (isPlainObject(record) && typeof key === 'string') {
      records.set(key, record)
    }
  }

  // * every leaf and container is recorded at its dotted path; plain objects are also recursed
  // * into, which is where the default_parameters / reasoning_config detail comes from
  const paths = new Map<string, unknown[]>()
  const collect = (value: unknown, path: string, depth: number) => {
    paths.set(path, [...(paths.get(path) ?? []), value])
    if (isPlainObject(value) && depth < MAX_DEPTH) {
      for (const [key, child] of Object.entries(value)) {
        collect(child, `${path}.${key}`, depth + 1)
      }
    }
  }
  for (const record of records.values()) {
    for (const [key, value] of Object.entries(record)) {
      collect(value, key, 1)
    }
  }

  // * a container with an open key set (pricing SKUs, per-parameter maps) is a dictionary, not
  // * a shape: its keys are data. Recursing gives one table per key, which drowns the report —
  // * so its children are pruned and the container reports which keys occur instead.
  const children = (path: string) =>
    [...paths.keys()].filter(
      (other) => other.startsWith(`${path}.`) && !other.slice(path.length + 1).includes('.'),
    )
  const dictionaries = new Set([...paths.keys()].filter((path) => children(path).length > MAX_KEYS))
  const insideDictionary = (path: string) =>
    [...dictionaries].some((root) => path.startsWith(`${root}.`))

  const total = records.size
  const ignoredPaths = [...paths.keys()].filter((path) => ignoredBy(path) !== undefined)
  const collapsedPaths = [...paths.keys()].filter(
    (path) => ignoredBy(path) === undefined && insideDictionary(path),
  )
  const analysed = [...paths.keys()]
    .toSorted()
    .filter((path) => ignoredBy(path) === undefined && !insideDictionary(path))
  const fields = analysed.map((path) => summarise(path, paths.get(path) ?? [], total))
  const of = (category: Category) => fields.filter((field) => field.category === category)

  // * dropped paths, grouped under the root that dropped them
  const ignored = table(
    ['field', 'paths', 'why'],
    Object.entries(entity.ignored).map(([root, reason]) => [
      `\`${root}\``,
      `${[...paths.keys()].filter((path) => ignoredBy(path) === root).length}`,
      reason,
    ]),
  )

  // * invariants: one value everywhere it appears (null counts). A second value is a real event
  const invariants = table(
    ['field', 'the only value', 'records', 'absent'],
    of('invariant').map((field) => [
      `\`${field.path}\``,
      label(field.values[0]),
      `${field.present}`,
      `${field.absent}`,
    ]),
  )

  const booleans = table(
    ['field', 'true', 'false', 'null', 'absent'],
    of('boolean').map((field) => {
      const counts = new Map(field.distinct)
      return [
        `\`${field.path}\``,
        `${counts.get('true') ?? 0}`,
        `${counts.get('false') ?? 0}`,
        `${field.nulls}`,
        `${field.absent}`,
      ]
    }),
  )

  // * enums get one table each — the value set is the point, so it gets room to breathe
  const enums = of('enum').flatMap((field) => [
    `### \`${field.path}\``,
    '',
    `${field.present} records · ${field.absent} absent · ${field.distinct.length} distinct values`,
    '',
    ...table(
      ['value', 'records', 'share'],
      field.distinct.map(([value, count]) => [
        label(value),
        `${count}`,
        `${Math.round((count / field.present) * 100)}%`,
      ]),
    ),
  ])

  // * min/median/max describe the numbers only; nulls are counted beside them
  const numbers = table(
    ['field', 'numbers', 'null', 'absent', 'distinct numbers', 'min', 'median', 'max'],
    of('number').map((field) => {
      const set = field.set.filter((value) => typeof value === 'number')
      const { min, median, max } = stats(set)
      return [
        `\`${field.path}\``,
        `${set.length}`,
        `${field.nulls}`,
        `${field.absent}`,
        `${frequencies(set).length}`,
        `${min}`,
        `${median}`,
        `${max}`,
      ]
    }),
  )

  // * arrays: how often empty, how long, and what the elements are (they are small value sets)
  const arrays = of('array').flatMap((field) => {
    const lists = field.set.filter((value): value is unknown[] => Array.isArray(value))
    const elements = frequencies(lists.flat())
    const { max, median } = stats(lists.map((list) => list.length))
    return [
      `### \`${field.path}\``,
      '',
      `${lists.length} set · ${lists.filter((list) => list.length === 0).length} empty · ${field.nulls} null · ${field.absent} absent · length median ${median}, max ${max}`,
      '',
      ...table(['element', 'records'], countRows(elements, MAX_LISTED)),
    ]
  })

  // * containers. A fixed shape is described by which key sets co-occur (its children are
  // * analysed as fields of their own); a dictionary is described by which keys occur at all
  const objects = of('object').flatMap((field) => {
    const instances = field.set.filter(isPlainObject)
    const dictionary = dictionaries.has(field.path)
    const counts = frequencies(
      dictionary
        ? instances.flatMap((value) => Object.keys(value))
        : instances.map((value) => Object.keys(value).toSorted().join(', ') || '(empty)'),
    )
    const kids = fields.filter((other) => other.path.startsWith(`${field.path}.`)).length
    return [
      `### \`${field.path}\``,
      '',
      dictionary
        ? `${instances.length} set · ${field.nulls} null · ${field.absent} absent · open key set (dictionary) · ${counts.length} distinct keys, not analysed as fields`
        : `${instances.length} set · ${field.nulls} null · ${field.absent} absent · ${kids} child fields · ${counts.length} distinct key sets`,
      '',
      ...table([dictionary ? 'key' : 'key set', 'records'], countRows(counts, MAX_LISTED)),
    ]
  })

  // * opaque: ids and free text. Only shape is reportable, and shape is all we need. Distinct
  // * counts the strings themselves — null and "" are called out in their own columns
  const opaque = table(
    [
      'field',
      'strings',
      'null',
      'empty',
      'absent',
      'distinct strings',
      'length min/median/max',
      'note',
    ],
    of('opaque').map((field) => {
      const strings = field.set.filter((value) => typeof value === 'string')
      const nonEmpty = strings.filter((value) => value !== '')
      const { min, median, max } = stats(nonEmpty.map((value) => value.length))
      return [
        `\`${field.path}\``,
        `${strings.length}`,
        `${field.nulls}`,
        `${strings.length - nonEmpty.length}`,
        `${field.absent}`,
        `${frequencies(nonEmpty).length}`,
        `${min} / ${median} / ${max}`,
        field.uuids ? 'uuids' : '',
      ]
    }),
  )

  const report = [
    `# ${name} fields — key/value analysis`,
    '',
    `Pass \`${captured_at}\` · ${total} ${name} records (deduped by \`${entity.identity}\`) · ${fields.length} paths analysed, ${ignoredPaths.length} ignored, ${collapsedPaths.length} collapsed into dictionaries.`,
    'Generated by `bun run fields`.',
    '',
    'Nested objects are recursed into as dotted paths. **`null` is treated as a value** and',
    'appears in the frequency tables like any other; **absent** (the key is missing entirely) is',
    'counted separately, because upstream uses the two to mean different things.',
    '',
    ...table(
      ['section', 'fields', 'what it means'],
      [
        [
          '[Invariants](#invariants)',
          `${of('invariant').length}`,
          'never more than one value observed',
        ],
        ['[Booleans](#booleans)', `${of('boolean').length}`, 'true / false / null split'],
        ['[Enums](#enums)', `${of('enum').length}`, 'closed value set, enumerated'],
        ['[Numbers](#numbers)', `${of('number').length}`, 'open numeric range'],
        ['[Arrays](#arrays)', `${of('array').length}`, 'length and element frequencies'],
        ['[Objects](#objects)', `${of('object').length}`, 'containers, by key set'],
        ['[Opaque](#opaque)', `${of('opaque').length}`, 'ids and free text — shape only'],
        ['[Ignored](#ignored)', `${ignoredPaths.length}`, 'excluded from the analysis on purpose'],
      ],
    ),
    ...section(
      'Invariants',
      'One value everywhere the key appears — `null` counts, so always-null and always-false fields sit side by side. Nothing to model; a second value appearing here is a real event.',
      invariants,
    ),
    ...section('Booleans', 'Watch for the ones that are never false.', booleans),
    ...section('Enums', 'Closed value sets, small enough to enumerate in full.', enums),
    ...section(
      'Numbers',
      'Open numeric ranges. Small numeric sets are under Enums instead.',
      numbers,
    ),
    ...section('Arrays', 'How often empty, how long, and what the elements are.', arrays),
    ...section(
      'Objects',
      'Containers. A fixed shape is described by which key sets co-occur, and its children are analysed as fields of their own above. A container with an open key set is a dictionary: its keys are data, so they are listed here and not analysed one table each.',
      objects,
    ),
    ...section(
      'Opaque',
      'Identifiers and free text — high cardinality or uuids. Shape is all that is reportable.',
      opaque,
    ),
    ...section(
      'Ignored',
      'Dropped from every section above, with their children. Listed here so the report never silently omits a field.',
      ignored,
    ),
  ]

  return { records: total, report: report.join('\n') }
}

const selected = args.entity === undefined ? Object.keys(ENTITIES) : [args.entity]
for (const name of selected) {
  const entity = ENTITIES[name]
  if (entity === undefined) {
    throw new Error(`unknown entity ${name} — expected one of ${Object.keys(ENTITIES).join(', ')}`)
  }
  const { records, report } = analyse(name, entity)
  const outPath = `${outputDir}${name}-fields_${captured_at}.md`
  await Bun.write(outPath, `${report}\n`)
  console.log(`[fields] wrote ${outPath}`, { records })
}
