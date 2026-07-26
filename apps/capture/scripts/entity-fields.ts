// * What every field of every raw entity in one capture pass actually contains, as an HTML report
// * identified by the pass that produced it. The point is deciding how to canonicalize: which
// * fields have nothing to model (one value, ever), which are closed value sets we can rely on,
// * which are only describable by shape, and how much of each is null versus absent.
// *
// * Reads the *raw* records, so unknown keys show up — an unknown key is the finding. Nested
// * objects are recursed into as dotted paths; ids and bulk text are summarised by shape, never
// * dumped.
// *
// * HTML rather than Markdown because the interesting questions are comparative and the answer set
// * is ~900 fields: the report ships every field's full frequency table and lets the page filter,
// * sort and expand, instead of a static document choosing in advance which 30 values matter.
// * Run: bun run fields [pass] [--entity <names>] [--last n] [--list] [--out dir] [--refresh]
import { Buffer } from 'node:buffer'

import { Command } from 'commander'
import prettyBytes from 'pretty-bytes'

import { forget, passes, select } from './artifacts.ts'
import { isPlainObject, readPass } from './pass.ts'
import type { PassRecords } from './pass.ts'
import { page } from './report.ts'

const program = new Command()
  .name('fields')
  .description('key/value analysis of every raw field in a capture pass, as an HTML report')
  .argument('[pass]', 'captured_at, or a prefix of one (default: the latest pass)')
  .option('-e, --entity <names>', 'comma-separated subset of catalog,endpoints,models,providers')
  .option('-l, --list [count]', 'list the most recent passes and exit')
  .option('-n, --last <count>', 'how many passes, ending at the selected one — one report each')
  .option('-o, --out <dir>', 'directory to write into', 'output')
  .option('-r, --refresh', 're-read the Worker url and the key listing from the stack')
  .parse()

const options = program.opts<{
  entity?: string
  last?: string
  list?: boolean | string
  out: string
  refresh?: boolean
}>()

const MAX_DEPTH = 4
// * past this a field is an id or free text, not a value set worth calling an enum
const ENUM_LIMIT = 30
// * how many rows of a frequency table travel to the page — generous, since the page can scroll
const MAX_ROWS = 60
const MAX_VALUE_CHARS = 90
// * a container with more distinct child keys than this is a dictionary, not a shape
const MAX_KEYS = 25
// * uuids are identity, never a value set — low cardinality only means most rows are null
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// * the raw entities a pass carries, each with its natural key, where its records come from, and
// * the paths we drop (with their children) and why. Dropped paths are still counted and listed in
// * the report, so nothing is silently missing.
type Entity = {
  identity: string
  ignored: Record<string, string>
  note: string
  records: (pass: PassRecords) => unknown[]
}

const ENTITIES: Record<string, Entity> = {
  catalog: {
    identity: 'slug',
    ignored: {},
    note: 'one row per model in the catalog listing — OpenRouter’s entire model history, including models with no endpoints. Each row embeds one endpoint, which is what the frontend renders.',
    records: (pass) => pass.entities.catalog,
  },
  endpoints: {
    identity: 'id',
    ignored: {
      'pricing.display_pricing':
        'byte-identical duplicate of the top-level display_pricing (verified) — analysed there instead',
      routing_heuristics_by_tier: 'volatile telemetry — belongs to the analytics pipeline',
      stats: 'volatile telemetry — belongs to the analytics pipeline',
      statsByTier: 'volatile telemetry — belongs to the analytics pipeline',
      status_heuristics: 'volatile telemetry — belongs to the analytics pipeline',
      status_heuristics_1d: 'volatile telemetry — belongs to the analytics pipeline',
      status_heuristics_5m: 'volatile telemetry — belongs to the analytics pipeline',
    },
    note: 'every endpoint returned by every stats/endpoint request in the pass, stripped of its embedded model and provider_info copies (analysed as their own entities).',
    records: (pass) => pass.entities.endpoints,
  },
  models: {
    identity: 'slug',
    ignored: {
      reasoning_config:
        'byte-for-byte identical to features.reasoning_config on every record — analysed there instead',
    },
    note: 'recovered from the copies embedded in each endpoint, deduped by slug — upstream returns no model records of its own here.',
    records: (pass) => pass.entities.models,
  },
  providers: {
    identity: 'slug',
    ignored: {},
    note: 'the provider_info copies embedded in endpoints, deduped by slug across the whole pass.',
    records: (pass) => pass.entities.providers,
  },
}

// * what a field turned out to be. The order is the order the page offers them in: invariants and
// * enums are decisions we can act on, opaque fields are ones we can only describe.
const CATEGORIES = ['invariant', 'boolean', 'enum', 'number', 'array', 'object', 'opaque'] as const
type Category = (typeof CATEGORIES)[number]

const label = (value: unknown) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS)}…` : text
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

// * frequency rows, capped, with however many were left off
const rows = (counts: Array<[string, number]>, limit = MAX_ROWS) => ({
  more: Math.max(0, counts.length - limit),
  top: counts.slice(0, limit).map(([value, count]) => ({ count, value: label(value) })),
})

const quantile = (sorted: number[], at: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * at))] ?? 0

const fmt = (value: number) =>
  Number.isInteger(value) && Math.abs(value) < 1e12
    ? String(value)
    : String(Number(value.toPrecision(3)))

// * a histogram is only ever an approximation of the value table, so it earns its place only when
// * the table is too long to read as a distribution. Below this the exact values are the better
// * answer — a four-value enum in twelve buckets is eight empty bars and a lie about continuity.
const MIN_FOR_HISTOGRAM = 16
// * how many buckets to aim for. The nice-number step decides the actual count, which is the point.
const TARGET_BUCKETS = 10

// * Bucket edges a reader can name. Arbitrary edges (`min + span/12`) put boundaries in the middle
// * of round numbers, and "18400 – 32768" says nothing about a field whose values are powers of two;
// * "20000 – 50000" does. So the edges are always round: a 1/2/2.5/5 × 10ⁿ step on a linear axis,
// * and 1-2-5 × 10ⁿ per decade on a log one.
const linearEdges = (min: number, max: number) => {
  const rough = (max - min) / TARGET_BUCKETS
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((size) => size >= rough) ??
    magnitude * 10
  const first = Math.floor(min / step) * step
  // * multiplied out rather than accumulated, which would drift on the 2.5 step
  return Array.from(
    { length: Math.ceil((max - first) / step) + 1 },
    (_, index) => first + index * step,
  )
}

const logEdges = (min: number, max: number) => {
  // * three edges per decade normally; whole decades once that would run past ~15 buckets, which
  // * a field like limit_rpm (1 … 40,000) otherwise does
  const decades = Math.log10(max / min)
  const factors = decades * 3 > 15 ? [1] : [1, 2, 5]
  const candidates: number[] = []
  for (let power = Math.floor(Math.log10(min)); 10 ** power <= max; power += 1) {
    candidates.push(...factors.map((factor) => factor * 10 ** power))
  }
  candidates.push(10 ** (Math.floor(Math.log10(max)) + 1))
  // * the decade grid, trimmed to the last edge at or below min through the first at or above max
  const from = candidates.findLastIndex((edge) => edge <= min)
  const to = candidates.findIndex((edge) => edge >= max)
  return candidates.slice(Math.max(0, from), to + 1)
}

// * log-scaled when the values span orders of magnitude — which token limits and prices both do,
// * and a linear histogram of them is one full bar and nine empty ones. Zero can't sit on a log
// * axis and is a real state in these fields ("no limit"), so it gets its own bucket.
const histogram = (numbers: number[]) => {
  const distinct = new Set(numbers)
  if (distinct.size < MIN_FOR_HISTOGRAM) {
    return []
  }
  const positives = numbers.filter((value) => value > 0)
  const [min, max] = [Math.min(...numbers), Math.max(...numbers)]
  const [lowest, highest] = [Math.min(...positives), Math.max(...positives)]
  const log = min >= 0 && positives.length > 0 && highest / lowest > 100

  const edges = log ? logEdges(lowest, highest) : linearEdges(min, max)
  const buckets = edges.slice(0, -1).map((low, index) => ({
    count: 0,
    label: `${fmt(low)} – ${fmt(edges[index + 1] ?? low)}`,
  }))
  for (const value of log ? positives : numbers) {
    // * half-open buckets, [low, high), with the top one closed so max lands inside it
    const index = Math.min(
      buckets.length - 1,
      edges.findLastIndex((edge) => edge <= value),
    )
    const bucket = buckets[Math.max(0, index)]
    if (bucket !== undefined) {
      bucket.count += 1
    }
  }

  const zeros = log ? numbers.length - positives.length : 0
  return [
    ...(zeros > 0 ? [{ count: zeros, label: '0' }] : []),
    // * empty buckets in the middle are a real gap in the data; empty ones at either end are only
    // * the grid overshooting the range
    ...buckets.slice(
      buckets.findIndex((bucket) => bucket.count > 0),
      buckets.findLastIndex((bucket) => bucket.count > 0) + 1,
    ),
  ]
}

// * one field, everything the page can say about it. Built once here so the page never has to
// * re-derive anything: it filters, sorts and expands this.
// * a path's own last segment, and the part of it that is context. Both travel to the page so the
// * field list can be read as a tree instead of 120 lines of repeated prefixes.
const split = (path: string) => {
  if (path.endsWith('[]')) {
    return { leaf: '[]', prefix: path.slice(0, -2) }
  }
  const dot = path.lastIndexOf('.')
  return dot === -1
    ? { leaf: path, prefix: '' }
    : { leaf: path.slice(dot + 1), prefix: path.slice(0, dot + 1) }
}

const summarise = ({
  children,
  dictionary,
  path,
  total,
  values,
}: {
  children: number
  dictionary: boolean
  path: string
  total: number
  values: unknown[]
}) => {
  const present = values.length
  const nulls = values.filter((value) => value === null).length
  // * null is a value, not a gap — upstream uses it as a real state, so it sits in the frequency
  // * tables alongside everything else. Absence (no key at all) is the gap, counted separately.
  const distinct = frequencies(values)
  const set = values.filter((value) => value !== null)

  const kinds = new Set(
    set.map((value) => {
      if (Array.isArray(value)) {
        return 'array'
      }
      return isPlainObject(value) ? 'object' : typeof value
    }),
  )
  const uuids = set.some((value) => typeof value === 'string' && UUID.test(value))

  // * at most one distinct value ever observed — "always null" and "always 0 when set at all" are
  // * the same finding wearing different clothes
  const category: Category = (() => {
    if (distinct.length <= 1) {
      return 'invariant'
    }
    if (kinds.has('object')) {
      return 'object'
    }
    if (kinds.has('array')) {
      return 'array'
    }
    if (kinds.has('boolean')) {
      return 'boolean'
    }
    if (distinct.length <= ENUM_LIMIT && !uuids) {
      return 'enum'
    }
    return kinds.has('number') ? 'number' : 'opaque'
  })()

  const field = {
    absent: total - present,
    category,
    children,
    // * how deep the path is, in separators — the page indents by it
    depth: (path.match(/\[\]|\./g) ?? []).length,
    distinct: distinct.length,
    kinds: [...kinds].toSorted(),
    nulls,
    path,
    present,
    set: set.length,
    total,
    uuids,
    ...split(path),
    ...rows(distinct),
  }

  // * numbers: the range is the finding, and the histogram is how it is distributed inside it
  if (kinds.has('number')) {
    const numbers = set.filter((value): value is number => typeof value === 'number')
    const sorted = numbers.toSorted((a, b) => a - b)
    return {
      ...field,
      numbers: {
        count: numbers.length,
        histogram: histogram(numbers),
        max: fmt(sorted.at(-1) ?? 0),
        median: fmt(quantile(sorted, 0.5)),
        min: fmt(sorted[0] ?? 0),
        p25: fmt(quantile(sorted, 0.25)),
        p75: fmt(quantile(sorted, 0.75)),
      },
    }
  }

  // * strings: length is the only thing an id or a paragraph of prose will tell us
  if (kinds.has('string')) {
    const strings = set.filter((value): value is string => typeof value === 'string')
    const lengths = strings.filter((value) => value !== '').map((value) => value.length)
    const sorted = lengths.toSorted((a, b) => a - b)
    return {
      ...field,
      strings: {
        count: strings.length,
        empty: strings.length - lengths.length,
        max: sorted.at(-1) ?? 0,
        median: quantile(sorted, 0.5),
        min: sorted[0] ?? 0,
      },
    }
  }

  // * arrays: how often empty, how long, and what the elements are. A list of scalars is described
  // * by which values occur; a list of objects by which key sets occur, because its fields are
  // * analysed one level down at `<path>[]` and dumping whole elements here would say nothing.
  if (kinds.has('array')) {
    const lists = set.filter((value): value is unknown[] => Array.isArray(value))
    const lengths = lists.map((list) => list.length).toSorted((a, b) => a - b)
    const elements = lists.flat()
    const objects = elements.filter(isPlainObject)
    return {
      ...field,
      array: {
        count: lists.length,
        elements: elements.length,
        empty: lists.filter((list) => list.length === 0).length,
        max: lengths.at(-1) ?? 0,
        median: quantile(lengths, 0.5),
        objects: objects.length === elements.length && objects.length > 0,
        ...rows(
          frequencies(
            objects.length === elements.length && objects.length > 0
              ? objects.map((value) => Object.keys(value).toSorted().join(', ') || '(empty)')
              : elements,
          ),
        ),
      },
    }
  }

  // * containers. A fixed shape is described by which key sets co-occur — its children are
  // * analysed as fields of their own. A dictionary's keys are data, so they are listed instead.
  if (kinds.has('object')) {
    const instances = set.filter(isPlainObject)
    return {
      ...field,
      object: {
        count: instances.length,
        dictionary,
        ...rows(
          frequencies(
            dictionary
              ? instances.flatMap((value) => Object.keys(value))
              : instances.map((value) => Object.keys(value).toSorted().join(', ') || '(empty)'),
          ),
        ),
      },
    }
  }

  return field
}

export type Field = ReturnType<typeof summarise>

// * one entity: dedupe its records by natural key, walk every path in them, and summarise each
const analyse = (name: string, entity: Entity, pass: PassRecords) => {
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
    if (depth >= MAX_DEPTH) {
      return
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        collect(child, `${path}.${key}`, depth + 1)
      }
    }
    // * ⚠️ An array of objects is a set of records, not a value. Summarising it as one — 722
    // * distinct JSON blobs, none of them readable — is what makes display_pricing impossible to
    // * argue about, so each element is collected at `<path>[]` and analysed like any other record.
    // * Its fields then answer per element (how many SKU rows carry a `price`), not per endpoint.
    // * the element hop is not a nesting level: `[]` is the same object one layer out, so the depth
    // * cap keeps meaning "four levels of object nesting" wherever the objects happen to live
    if (Array.isArray(value)) {
      for (const element of value) {
        if (isPlainObject(element)) {
          collect(element, `${path}[]`, depth)
        }
      }
    }
  }
  for (const record of records.values()) {
    for (const [key, value] of Object.entries(record)) {
      collect(value, key, 1)
    }
  }

  // * a container with an open key set (pricing SKUs, per-parameter maps) is a dictionary: its
  // * keys are data. Recursing gives one field per key, which drowns the report — so its children
  // * are pruned and the container reports which keys occur instead.
  const childrenOf = (path: string) =>
    [...paths.keys()].filter(
      (other) => other.startsWith(`${path}.`) && !other.slice(path.length + 1).includes('.'),
    )
  const dictionaries = new Set(
    [...paths.keys()].filter((path) => childrenOf(path).length > MAX_KEYS),
  )
  // * a root covers its children *and* its elements — `pricing.display_pricing` being dropped has
  // * to drop `pricing.display_pricing[].price` with it, or an ignored field comes back one level
  // * down wearing brackets
  const covers = (root: string, path: string) =>
    path === root || path.startsWith(`${root}.`) || path.startsWith(`${root}[]`)
  const under = (roots: Iterable<string>, path: string) =>
    [...roots].find((root) => covers(root, path))
  // * the dictionary itself stays; only what is inside it is pruned
  const insideDictionary = (path: string) =>
    [...dictionaries].some((root) => path !== root && covers(root, path))

  const ignoredRoots = Object.keys(entity.ignored)
  const analysed = [...paths.keys()]
    .toSorted()
    .filter((path) => under(ignoredRoots, path) === undefined && !insideDictionary(path))

  // * what a field's counts are out of. A field inside an array element answers per element — the
  // * elements are its records — so its denominator is how many elements there were, not how many
  // * records the entity has. Anything else would make "absent" meaningless in there.
  const totalFor = (path: string) => {
    const element = path.lastIndexOf('[]')
    return element === -1
      ? records.size
      : (paths.get(path.slice(0, element + 2))?.length ?? records.size)
  }

  const fields = analysed.map((path) =>
    summarise({
      children: [...paths.keys()].filter(
        (other) => other.startsWith(`${path}.`) || other.startsWith(`${path}[]`),
      ).length,
      dictionary: dictionaries.has(path),
      path,
      total: totalFor(path),
      values: paths.get(path) ?? [],
    }),
  )

  return {
    // * dictionary roots, and how many child paths each one swallowed
    collapsed: [...dictionaries].toSorted().map((root) => ({
      paths: [...paths.keys()].filter((path) => path !== root && covers(root, path)).length,
      root,
    })),
    // * how the fields split by category — the entity's shape in seven numbers
    counts: Object.fromEntries(
      CATEGORIES.map((category) => [
        category,
        fields.filter((field) => field.category === category).length,
      ]),
    ),
    fields,
    identity: entity.identity,
    // * dropped paths, grouped under the root that dropped them
    ignored: Object.entries(entity.ignored).map(([root, why]) => ({
      paths: [...paths.keys()].filter((path) => under([root], path) !== undefined).length,
      root,
      why,
    })),
    name,
    note: entity.note,
    records: records.size,
  }
}

// * the pass's own account of itself, as the header chips. Cache status is why every downstream
// * timing claim holds: it says whether an unchanged response means the world stood still or that
// * we were handed the same cached object.
const chipsFor = (pass: PassRecords, entities: Array<{ fields: unknown[] }>) => {
  const { summary } = pass
  const cache = Object.entries(summary.freshness?.cache ?? {}).toSorted(([, a], [, b]) => b - a)
  return [
    { label: 'scopes read', value: `${pass.scopes.total}` },
    { label: 'with endpoints', value: `${pass.scopes.withEndpoints}` },
    { label: 'transport errors', value: `${summary.errors.length}` },
    {
      label: 'http statuses',
      value:
        Object.entries(summary.statuses)
          .map(([status, count]) => `${status}×${count}`)
          .join(' ') || '—',
    },
    {
      label: 'cf-cache-status',
      value: cache.map(([state, n]) => `${state}×${n}`).join(' ') || '—',
    },
    { label: 'max age (s)', value: `${summary.freshness?.maxAge ?? 0}` },
    { label: 'catalog rows', value: `${summary.models}` },
    { label: 'fields analysed', value: `${entities.reduce((n, e) => n + e.fields.length, 0)}` },
  ]
}

const BLURB = `Every field of every raw entity in one pass, as it was returned — unknown keys
included. Nested objects are recursed into as dotted paths. <b>null is treated as a value</b> and
appears in the frequency tables like any other; <b>absent</b> (the key is missing entirely) is
counted separately, because upstream uses the two to mean different things. Fields are grouped by
what they turned out to be: an invariant has nothing to model, an enum is a value set we can rely
on, an opaque field is one only shape describes.
<br><br>An <b>array of objects is a set of records</b>, not a value: its elements are analysed at
<code>&lt;path&gt;[]</code>, and every count under that path is <b>per element</b> — how many SKU rows
carry a <code>price</code>, not how many endpoints do. The array itself then reports its lengths and
which key sets its elements have.`

// * this report's own styling, on top of the shell's. One colour per category, used everywhere the
// * category appears — the split bar, the filter pills, the badge on each row — so the eye can
// * follow a category across the page without reading a word.
const STYLES = `
.cat-invariant { --cat: oklch(60% 0.02 265); }
.cat-boolean   { --cat: oklch(62% 0.16 25); }
.cat-enum      { --cat: oklch(58% 0.17 265); }
.cat-number    { --cat: oklch(60% 0.15 200); }
.cat-array     { --cat: oklch(62% 0.15 160); }
.cat-object    { --cat: oklch(65% 0.16 300); }
.cat-opaque    { --cat: oklch(66% 0.13 75); }

.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.tab {
  padding: 8px 14px; background: transparent; border: 1px solid transparent; border-radius: 8px;
  color: var(--dim);
}
.tab b { font-variant-numeric: tabular-nums; margin-left: 4px; color: var(--faint); }
.tab:hover { background: var(--panel); }
.tab.on { background: var(--panel); border-color: var(--line); color: var(--ink); box-shadow: var(--shadow); }
.tab.on b { color: var(--dim); }

.meanings { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0 0 16px; font-size: 12px; }
.meanings span { display: flex; gap: 6px; align-items: center; }
.meanings i, .pill i { width: 8px; height: 8px; border-radius: 2px; background: var(--cat); }

.entity { overflow: hidden; }
.overview { padding: 20px 20px 16px; }
.overview h2 { margin: 0; font-size: 16px; text-transform: capitalize; }
.overview p { margin: 6px 0 14px; max-width: 90ch; font-size: 13px; }
.split { display: flex; gap: 2px; height: 10px; }
.split i { display: block; border-radius: 2px; background: var(--cat); }
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.pill {
  display: flex; gap: 6px; align-items: center; padding: 4px 9px; font-size: 12px;
  background: transparent; border: 1px solid var(--line); border-radius: 999px; color: var(--dim);
}
.pill:hover { border-color: var(--cat); }
.pill.on { background: var(--accent-soft); border-color: var(--cat); color: var(--ink); }
.pill b { font-variant-numeric: tabular-nums; }

.toolbar {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 12px 20px;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
  background: var(--bg); position: sticky; top: 0; z-index: 2;
}
.toolbar .search {
  flex: 1 1 260px; padding: 7px 11px; font: inherit; color: inherit; background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px;
}
.toolbar .search:focus-visible, .tab:focus-visible, .pill:focus-visible, .head:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 1px;
}
.toolbar label { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--dim); }
.toolbar select {
  padding: 6px 8px; font: inherit; font-size: 13px; color: inherit; background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px;
}
.toolbar .count { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 12px; }
.ghost { padding: 6px 10px; background: transparent; border: 1px solid var(--line); border-radius: 8px; color: var(--dim); }
.ghost:hover { color: var(--ink); }

.field { border-bottom: 1px solid var(--line); }
.field:last-child { border-bottom: 0; }
.head {
  display: grid; width: 100%; gap: 12px; align-items: center; padding: 9px 20px; text-align: left;
  background: transparent; border: 0;
  grid-template-columns: 12px minmax(160px, 1fr) 84px 230px 92px;
}
.head:hover { background: var(--accent-soft); }
/* the tree: indented by depth, with the context part of the path dimmed and a rule above each
   top-level group. Only in path order — .tree is dropped under any other sort. */
.tree .head { padding-left: calc(20px + var(--depth) * 15px); }
.tree .field:not([data-depth='0']) > .head { box-shadow: inset 1px 0 0 var(--line); }
.tree .field[data-depth='0'] { border-top: 1px solid var(--line); }
.tree .field:first-child { border-top: 0; }
.path .prefix { color: var(--faint); }
.field.open { background: var(--accent-soft); }
.field.open > .head .tick { transform: rotate(90deg); }
.tick { color: var(--faint); transition: transform 120ms; }
.head .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat {
  padding: 2px 7px; font-size: 11px; color: var(--cat); border: 1px solid var(--cat);
  border-radius: 999px; text-align: center;
}
.cover .legend { display: block; margin-top: 4px; font-size: 11px; font-variant-numeric: tabular-nums; }
.distinct { font-size: 12px; color: var(--dim); text-align: right; font-variant-numeric: tabular-nums; }
.distinct b { color: var(--ink); }

.detail { padding: 4px 20px 22px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.stat {
  padding: 6px 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  min-width: 84px;
}
.stat span { display: block; font-size: 11px; color: var(--faint); text-transform: uppercase; letter-spacing: 0.04em; }
.stat b { font-variant-numeric: tabular-nums; }
.detail table { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
.detail table + table, .detail .hist + table { margin-top: 14px; }
.detail td.value { max-width: 48ch; overflow-wrap: anywhere; }
.detail th.share, .detail td.share { width: 180px; }
.detail td.share { display: flex; gap: 8px; align-items: center; }
.detail td.share .bar { flex: 1; }
.detail td.share span { font-size: 11px; font-variant-numeric: tabular-nums; min-width: 30px; }
.hist { margin: 0 0 14px; }
.hist-row { display: grid; gap: 10px; align-items: center; grid-template-columns: 200px 1fr 60px; padding: 2px 0; }
.hist-row .n { text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
.hist-row span { font-size: 11px; }

.footers { padding: 14px 20px 20px; border-top: 1px solid var(--line); }
.footers details { margin: 6px 0; }
.footers summary { cursor: pointer; color: var(--dim); font-size: 13px; }
.footers table { margin: 10px 0 16px; }

@media (max-width: 860px) {
  .head { grid-template-columns: 12px 1fr 84px; }
  .head .cover, .head .distinct { display: none; }
  .hist-row { grid-template-columns: 130px 1fr 48px; }
}
`

const client = await Bun.file(new URL('entity-fields.client.js', import.meta.url)).text()

const report = async (pass: PassRecords, names: string[]) => {
  const entities = names.map((name) => {
    const entity = ENTITIES[name]
    if (entity === undefined) {
      throw new Error(
        `unknown entity ${name} — expected one of ${Object.keys(ENTITIES).join(', ')}`,
      )
    }
    return analyse(name, entity, pass)
  })

  const html = page({
    blurb: BLURB,
    chips: chipsFor(pass, entities),
    data: { captured_at: pass.captured_at, categories: CATEGORIES, entities },
    identity: `pass ${pass.captured_at} · generated ${new Date().toISOString()}`,
    script: client,
    styles: STYLES,
    title: 'Raw entity fields',
  })

  const path = `${options.out.replace(/\/+$/, '')}/fields_${pass.captured_at}.html`
  await Bun.write(path, html)
  console.log(
    `${path} ${prettyBytes(Buffer.byteLength(html))} — ${entities
      .map((entity) => `${entity.records} ${entity.name}, ${entity.fields.length} fields`)
      .join(' · ')}`,
  )
}

const main = async () => {
  if (options.refresh === true) {
    await forget()
  }
  const all = await passes()

  // * --list: say what is there and stop
  if (options.list !== undefined) {
    const count = typeof options.list === 'string' ? Number(options.list) : 20
    for (const pass of all.slice(-count)) {
      console.log(`${pass.captured_at}  ${pass.keys.length} objects`)
    }
    console.log(`${all.length} passes, ${all.at(0)?.captured_at} … ${all.at(-1)?.captured_at}`)
    return
  }

  const names =
    options.entity === undefined
      ? Object.keys(ENTITIES)
      : options.entity.split(',').map((name) => name.trim())

  for (const pass of select(all, { last: options.last, pass: program.args[0] })) {
    // * the catalog is 5.8 MB per pass — only fetched when it is one of the entities asked for
    await report(await readPass(pass, { catalog: names.includes('catalog') }), names)
  }
}

// * a bad argument is a normal outcome for a CLI — say what is wrong, not where it was thrown
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
