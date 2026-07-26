// * Analysis helper: per-field churn across consecutive passes. Answers "how fast does this
// * field move, relative to its siblings" — the question that decides which lane a field belongs
// * in (see notes/data-architecture/normalized-store.md). A field changing in a large share of
// * passes cannot share a versioned row with fields that never move: it sets the write rate for
// * all of them and buries their signal in the change feed.
// *
// * Compares canonical entities pass-to-pass, field by field, counting only entities present in
// * both passes — a birth or a death is not a field change. Values are compared as JSON, so
// * nested objects and arrays count as changed when anything inside them moves (which is the
// * point: that is exactly what a single stored column would record).
// * Run: bun run churn [--from <captured_at>] [--passes N]
import { parseArgs } from 'node:util'

import { canonicalizeEndpoints } from '../canonicalize/endpoints.ts'
import { canonicalizeModels } from '../canonicalize/models.ts'
import { mirroredPasses, readPass } from '../canonicalize/pass.ts'
import { canonicalizeProviders } from '../canonicalize/providers.ts'

const { values: args } = parseArgs({
  options: { from: { type: 'string' }, passes: { type: 'string' } },
})

const outputDir = new URL('../../output/', import.meta.url).pathname

type Pass = Awaited<ReturnType<typeof readPass>>

// * one entity kind: how to get its canonical records out of a pass, what keys them, and how to
// * attribute a change — because "which field churns" and "who is doing it" are different
// * questions, and the second one is what tells us whether churn is a property of the data or of
// * a handful of participants.
type Kind = {
  key: (record: Record<string, unknown>) => string
  model: (record: Record<string, unknown>) => string
  provider: (record: Record<string, unknown>) => string
  records: (pass: Pass) => Array<Record<string, unknown>>
}

const NAMES = ['endpoints', 'models', 'providers'] as const
type Name = (typeof NAMES)[number]

const KINDS: Record<Name, Kind> = {
  endpoints: {
    key: (record) => String(record.id),
    model: (record) => String(record.model_variant_slug),
    provider: (record) => String(record.provider_slug),
    records: (pass) => canonicalizeEndpoints(pass.scopes.flatMap((scope) => scope.endpoints)),
  },
  models: {
    key: (record) => String(record.slug),
    model: (record) => String(record.slug),
    provider: () => '—',
    records: (pass) => canonicalizeModels(pass.scopes.map((scope) => scope.model)),
  },
  providers: {
    key: (record) => String(record.slug),
    model: () => '—',
    provider: (record) => String(record.slug),
    records: (pass) => canonicalizeProviders(pass.providers),
  },
}

// * what we learn about one field: how many entity-field changes it produced, how many pass
// * transitions contained at least one, and how much of the population it ever touched
type Churn = { changes: number; entities: Set<string>; transitions: number }

// * per-kind state. `previous` is the only thing carried between passes, so memory stays flat
// * however many passes are scanned.
type State = {
  born: number
  churn: Map<string, Churn>
  died: number
  // * changes attributed to `provider | model`, and to each alone — the concentration question
  byModel: Map<string, number>
  byPair: Map<string, number>
  byProvider: Map<string, number>
  previous: Map<string, Record<string, string>>
  seen: number
}
const blank = (): State => ({
  born: 0,
  byModel: new Map(),
  byPair: new Map(),
  byProvider: new Map(),
  churn: new Map(),
  died: 0,
  previous: new Map(),
  seen: 0,
})
const state: Record<Name, State> = {
  endpoints: blank(),
  models: blank(),
  providers: blank(),
}

const passes = mirroredPasses()
const from = args.from ?? passes[0] ?? ''
const limit = args.passes === undefined ? passes.length : Number(args.passes)
const selected = passes.filter((captured_at) => captured_at >= from).slice(0, limit)
if (selected.length < 2) {
  throw new Error('need at least two mirrored passes to measure churn')
}

for (const captured_at of selected) {
  const pass = await readPass(captured_at)

  for (const name of NAMES) {
    const tracked = state[name]
    const kind = KINDS[name]
    const before = tracked.previous

    const after = new Map<string, Record<string, string>>()
    // * who each entity belongs to, so a change can be attributed without re-reading the record
    const owners = new Map<string, { model: string; provider: string }>()
    for (const record of kind.records(pass)) {
      const values: Record<string, string> = {}
      for (const [field, value] of Object.entries(record)) {
        values[field] = JSON.stringify(value) ?? 'undefined'
      }
      const key = kind.key(record)
      after.set(key, values)
      owners.set(key, { model: kind.model(record), provider: kind.provider(record) })
    }

    // * fields that moved on at least one entity in this transition — so a field flipping on 40
    // * endpoints in one pass counts as one transition, not 40
    const moved = new Set<string>()
    for (const [key, values] of after) {
      const was = before.get(key)
      if (was === undefined) {
        continue
      }
      for (const [field, value] of Object.entries(values)) {
        if (was[field] === value) {
          continue
        }
        const entry = tracked.churn.get(field) ?? {
          changes: 0,
          entities: new Set<string>(),
          transitions: 0,
        }
        entry.changes += 1
        entry.entities.add(key)
        tracked.churn.set(field, entry)
        moved.add(field)

        const owner = owners.get(key)
        if (owner !== undefined) {
          const pair = `${owner.provider} | ${owner.model}`
          tracked.byPair.set(pair, (tracked.byPair.get(pair) ?? 0) + 1)
          tracked.byModel.set(owner.model, (tracked.byModel.get(owner.model) ?? 0) + 1)
          tracked.byProvider.set(owner.provider, (tracked.byProvider.get(owner.provider) ?? 0) + 1)
        }
      }
    }
    for (const field of moved) {
      const entry = tracked.churn.get(field)
      if (entry !== undefined) {
        entry.transitions += 1
      }
    }

    if (before.size > 0) {
      tracked.born += [...after.keys()].filter((key) => !before.has(key)).length
      tracked.died += [...before.keys()].filter((key) => !after.has(key)).length
    }
    tracked.seen = after.size
    tracked.previous = after
  }

  console.log(`[churn] ${captured_at}`)
}

const transitions = selected.length - 1

// * classification hint, from question 2 of the lane process: a field moving in more than ~10%
// * of passes has to justify sharing a versioned row with its stable siblings
const verdict = (entry: Churn) => {
  const share = entry.transitions / transitions
  if (share === 0) {
    return 'static'
  }
  if (share > 0.9) {
    return '⚠️⚠️ every pass'
  }
  if (share > 0.1) {
    return '⚠️ volatile'
  }
  return 'occasional'
}

const report = [
  '# Field churn across consecutive passes',
  '',
  `${selected.length} passes (\`${selected[0]}\` → \`${selected.at(-1)}\`), ${transitions} transitions.`,
  'Generated by `bun run churn`.',
  '',
  'Only entities present in both passes are compared — births and deaths are not field changes.',
  'Values are compared as JSON, so a nested object counts as changed when anything inside it',
  'moves. **transitions** is how many of the pass boundaries contained at least one change to',
  'this field; **changes** is the total entity-field changes summed over all of them.',
  '',
]

for (const name of NAMES) {
  const tracked = state[name]
  const rows = [...tracked.churn].toSorted(
    ([, a], [, b]) => b.transitions - a.transitions || b.changes - a.changes,
  )
  report.push(
    `## ${name}`,
    '',
    `${tracked.seen} in the final pass · ${tracked.born} born · ${tracked.died} died · ${rows.length} fields moved at all`,
    '',
    '| field | transitions | share of passes | changes | entities touched | verdict |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map(([field, entry]) => {
      const share = Math.round((entry.transitions / transitions) * 100)
      return `| \`${field}\` | ${entry.transitions}/${transitions} | ${share}% | ${entry.changes} | ${entry.entities.size} | ${verdict(entry)} |`
    }),
    '',
  )

  // * ⚠️ The concentration question, and the one that decides whether churn is a property of this
  // * data class or of a few participants currently behaving unusually. A design that assumes the
  // * former when the latter is true over-engineers; the reverse under-engineers.
  const total = [...tracked.byPair.values()].reduce((sum, count) => sum + count, 0)
  if (total === 0) {
    continue
  }
  const ranked = (counts: Map<string, number>) => {
    let running = 0
    return [...counts]
      .toSorted(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([label, count]) => {
        running += count
        return [
          `\`${label}\``,
          `${count}`,
          `${Math.round((count / total) * 100)}%`,
          `${Math.round((running / total) * 100)}%`,
        ]
      })
  }
  report.push(
    `### Where ${name} churn comes from`,
    '',
    `${total} field changes in total, attributed. Cumulative share shows how few participants`,
    'account for how much.',
    '',
    '| provider × model | changes | share | cumulative |',
    '| --- | --- | --- | --- |',
    ...ranked(tracked.byPair).map((row) => `| ${row.join(' | ')} |`),
    '',
    '| provider | changes | share | cumulative |',
    '| --- | --- | --- | --- |',
    ...ranked(tracked.byProvider).map((row) => `| ${row.join(' | ')} |`),
    '',
    '| model | changes | share | cumulative |',
    '| --- | --- | --- | --- |',
    ...ranked(tracked.byModel).map((row) => `| ${row.join(' | ')} |`),
    '',
  )
}

const outPath = `${outputDir}field-churn_${selected.at(-1)}.md`
await Bun.write(outPath, `${report.join('\n')}\n`)
console.log(`[churn] wrote ${outPath}`)
