// * Analysis helper: what the five pricing representations actually are, and what actually moves
// * in them. The churn report says `pricing` and `display_pricing` move in 33/39 transitions while
// * `pricing_json` moves in 6 — so most "pricing changes" are not price changes, and this exists
// * to show what they are instead of theorising about it.
// *
// * Two halves:
// * - **change detail** — every leaf of every view, diffed per endpoint per transition, with real
// *   before/after values. Answers "what moved".
// * - **derivability** — for the newest pass, whether each key of `pricing` can be reproduced from
// *   `pricing_json` at the endpoint's stated `discount`. Answers "what is this view for", which
// *   is what decides whether it can be left unstored.
// * Run: bun run pricing-changes [--from <captured_at>] [--passes N]
import { parseArgs } from 'node:util'

import { canonicalizeEndpoints } from '../canonicalize/endpoints.ts'
import { mirroredPasses, readPass } from '../canonicalize/pass.ts'

const { values: args } = parseArgs({
  options: { from: { type: 'string' }, passes: { type: 'string' } },
})

const outputDir = new URL('../../output/', import.meta.url).pathname

// * the five overlapping representations, in the order they matter: source of truth first
const VIEWS = ['pricing_json', 'pricing', 'display_pricing', 'tiers', 'pricing_version_id'] as const
type View = (typeof VIEWS)[number]

// * every leaf of a value, keyed by its dotted path. Arrays get index paths, which is what makes
// * `display_pricing.0.name` readable as "the first price row's label".
const leaves = (value: unknown, path: string, out: Map<string, string>) => {
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    if (entries.length > 0) {
      for (const [key, child] of entries) {
        leaves(child, path === '' ? key : `${path}.${key}`, out)
      }
      return out
    }
  }
  out.set(path, JSON.stringify(value) ?? 'undefined')
  return out
}

const flatten = (value: unknown) => leaves(value, '', new Map<string, string>())

// * one leaf that moved on one endpoint in one transition
type Move = {
  after: string
  before: string
  captured_at: string
  endpoint: string
  path: string
  view: View
}

const passes = mirroredPasses()
const from = args.from ?? passes[0] ?? ''
const limit = args.passes === undefined ? passes.length : Number(args.passes)
const selected = passes.filter((captured_at) => captured_at >= from).slice(0, limit)
if (selected.length < 2) {
  throw new Error('need at least two mirrored passes')
}

const moves: Move[] = []
// * per transition, per endpoint: which views moved. Lets us ask "did pricing move while
// * pricing_json stood still" without re-walking anything.
const touched: Array<{ captured_at: string; endpoint: string; views: Set<View> }> = []

// * ⚠️ The question suppression turns on. Per-pass drift is fractions of a percent and looks like
// * noise, but it accumulates — so track where the effective price started, where it ended, and how
// * far it travelled to get there. A large `moved` with a small `net` is flapping; the two being
// * close is a trend, and a trend is a price change however small each step was.
type Drift = {
  first: number
  label: string
  last: number
  steps: number
  travelled: number
}
const drift = new Map<string, Drift>()

let previous = new Map<string, Map<View, Map<string, string>>>()
// * kept for the derivability half, which only needs one pass — the newest
let latest: ReturnType<typeof canonicalizeEndpoints> = []
for (const captured_at of selected) {
  const pass = await readPass(captured_at)
  const current = new Map<string, Map<View, Map<string, string>>>()
  latest = canonicalizeEndpoints(pass.scopes.flatMap((scope) => scope.endpoints))

  for (const endpoint of latest) {
    const views = new Map<View, Map<string, string>>()
    for (const view of VIEWS) {
      views.set(view, flatten(endpoint[view]))
    }
    current.set(endpoint.id, views)

    // * the effective prompt price, in dollars per million tokens — the unit a user reads
    const effective = Number(endpoint.pricing.prompt) * 1e6
    if (Number.isFinite(effective)) {
      const seen = drift.get(endpoint.id)
      if (seen === undefined) {
        drift.set(endpoint.id, {
          first: effective,
          label: `${endpoint.provider_slug} | ${endpoint.model_variant_slug}`,
          last: effective,
          steps: 0,
          travelled: 0,
        })
      } else if (effective !== seen.last) {
        seen.travelled += Math.abs(effective - seen.last)
        seen.last = effective
        seen.steps += 1
      }
    }

    const was = previous.get(endpoint.id)
    if (was === undefined) {
      continue
    }
    const movedViews = new Set<View>()
    for (const view of VIEWS) {
      const before = was.get(view) ?? new Map<string, string>()
      const after = views.get(view) ?? new Map<string, string>()
      for (const path of new Set([...before.keys(), ...after.keys()])) {
        const b = before.get(path) ?? '(absent)'
        const a = after.get(path) ?? '(absent)'
        if (b !== a) {
          moves.push({ after: a, before: b, captured_at, endpoint: endpoint.id, path, view })
          movedViews.add(view)
        }
      }
    }
    if (movedViews.size > 0) {
      touched.push({ captured_at, endpoint: endpoint.id, views: movedViews })
    }
  }

  previous = current
  console.log(`[pricing] ${captured_at}`)
}

const table = (header: string[], rows: string[][]) => [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
  '',
]

const short = (id: string) => id.slice(0, 8)
const clip = (text: string, max = 44) => (text.length > max ? `${text.slice(0, max)}…` : text)

const of = (view: View) => moves.filter((move) => move.view === view)

// * which leaf paths move, and how often — the first question. A view whose only moving leaves are
// * derived numbers is a view we should not be storing.
const pathFrequency = (view: View) => {
  const counts = new Map<string, Move[]>()
  for (const move of of(view)) {
    // * collapse array indices: `display_pricing.3.discount` and `.7.discount` are the same leaf
    const key = move.path.replaceAll(/\.\d+\./g, '.#.').replace(/^\d+\./, '#.')
    counts.set(key, [...(counts.get(key) ?? []), move])
  }
  return [...counts].toSorted(([, a], [, b]) => b.length - a.length)
}

const report = [
  '# What actually changes in the pricing views',
  '',
  `${selected.length} passes (\`${selected[0]}\` → \`${selected.at(-1)}\`), ${selected.length - 1} transitions.`,
  'Generated by `bun run pricing-changes`.',
  '',
  'Every leaf path of the five pricing representations, diffed per endpoint per transition.',
  'Array indices are collapsed to `#` in the frequency tables so the same leaf of different price',
  'rows counts together.',
  '',
  '## Leaf moves per view',
  '',
  ...table(
    ['view', 'leaf moves', 'endpoints', 'transitions'],
    VIEWS.map((view) => [
      `\`${view}\``,
      `${of(view).length}`,
      `${new Set(of(view).map((move) => move.endpoint)).size}`,
      `${new Set(of(view).map((move) => move.captured_at)).size}`,
    ]),
  ),
]

// * per-view path frequency, with a real example of each
for (const view of VIEWS) {
  const paths = pathFrequency(view)
  if (paths.length === 0) {
    continue
  }
  report.push(
    `## \`${view}\` — which leaves move`,
    '',
    ...table(
      ['leaf path', 'moves', 'example before → after'],
      paths.map(([path, group]) => {
        const [example] = group
        return [
          `\`${path}\``,
          `${group.length}`,
          example === undefined ? '' : `\`${clip(example.before)}\` → \`${clip(example.after)}\``,
        ]
      }),
    ),
  )
}

// * the question the churn report raised: how often does a view move with no SKU movement under it
const jsonMoved = (entry: (typeof touched)[number]) => entry.views.has('pricing_json')
const withJson = touched.filter(jsonMoved)
const withoutJson = touched.filter((entry) => !jsonMoved(entry))

report.push(
  '## Movement with and without a real SKU change',
  '',
  `Endpoint-transitions where at least one pricing view moved: **${touched.length}**.`,
  `Of those, **${withJson.length}** had a \`pricing_json\` (source of truth) change and`,
  `**${withoutJson.length}** did not.`,
  '',
  ...table(
    ['view', 'moved WITH a SKU change', 'moved WITHOUT one'],
    VIEWS.map((view) => [
      `\`${view}\``,
      `${withJson.filter((entry) => entry.views.has(view)).length}`,
      `${withoutJson.filter((entry) => entry.views.has(view)).length}`,
    ]),
  ),
)

// * every real SKU movement, in full — there are few enough to read them all, and reading them is
// * the only way to know whether they are price changes, SKU renames, or adapter churn
const skuMoves = of('pricing_json')
report.push(
  '## Every `pricing_json` change in full',
  '',
  `${skuMoves.length} leaf moves. \`(absent)\` means the SKU appeared or disappeared.`,
  '',
  ...table(
    ['pass', 'endpoint', 'sku', 'before', 'after'],
    skuMoves.map((move) => [
      move.captured_at.slice(11, 19),
      short(move.endpoint),
      `\`${move.path}\``,
      `\`${move.before}\``,
      `\`${move.after}\``,
    ]),
  ),
)

// * pricing_version_id as a detector: does it move when prices move, and does it move otherwise
const idMoves = of('pricing_version_id')
const idWithJson = idMoves.filter((move) =>
  withJson.some(
    (entry) => entry.captured_at === move.captured_at && entry.endpoint === move.endpoint,
  ),
)
report.push(
  '## `pricing_version_id` as a change detector',
  '',
  `It moved ${idMoves.length} times: ${idWithJson.length} alongside a real SKU change,`,
  `${idMoves.length - idWithJson.length} with no SKU change at all.`,
  `Real SKU changes it missed: ${withJson.filter((entry) => !entry.views.has('pricing_version_id')).length}.`,
  '',
)

// * ── who is moving, and by how much in the end ──────────────────────────────────────────────
// * Two things the per-pass view cannot show. First, whether pricing churn is a property of the
// * data or of a few participants — because that decides whether the design has to absorb it
// * forever or ride it out. Second, what the drift adds up to: several cents per million tokens of
// * real movement, arriving in steps too small to report individually, is the case that suppression
// * has to answer for.
const drifted = [...drift.values()]
  .filter((entry) => entry.steps > 0)
  .toSorted((a, b) => b.travelled - a.travelled)

const totalTravelled = drifted.reduce((sum, entry) => sum + entry.travelled, 0)
let running = 0
const concentration = drifted.map((entry) => {
  running += entry.travelled
  return [
    `\`${entry.label}\``,
    `${entry.steps}`,
    `$${entry.first.toFixed(4)}`,
    `$${entry.last.toFixed(4)}`,
    `${entry.last >= entry.first ? '+' : ''}${(entry.last - entry.first).toFixed(4)}`,
    entry.travelled.toFixed(4),
    `${Math.round((running / totalTravelled) * 100)}%`,
  ]
})

report.push(
  '## Cumulative effective-price drift, and who causes it',
  '',
  `${drifted.length} endpoints moved their effective prompt price at all across ${selected.length - 1}`,
  'transitions. Prices are dollars per million prompt tokens (`pricing.prompt` × 1e6), so these are',
  'the numbers a user reads.',
  '',
  '**net** is where it ended up versus where it started; **travelled** is the sum of every step,',
  'so travelled ≫ |net| means flapping around a point and travelled ≈ |net| means a trend. The',
  'cumulative column is the share of all movement, most-active first.',
  '',
  ...table(
    ['provider × model', 'steps', 'first', 'last', 'net', 'travelled', 'cumulative'],
    concentration,
  ),
  `Total movement across all endpoints: $${totalTravelled.toFixed(4)} / MTOK.`,
  '',
)

// * ── is `pricing` derivable? ────────────────────────────────────────────────────────────────
// * `pricing` is upstream's normalized view. For the token SKUs it is exactly the SKU price with
// * the endpoint's discount applied — in which case storing it is redundant, and it churns for a
// * reason that has nothing to do with prices. For the non-token modalities it applies unit
// * conversions whose factors are not in the data, and in some cases it carries a price with no
// * SKU behind it at all. Those are information that exists nowhere else.
const num = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), 1e-15) * 1e-9

type Derivability = {
  // * reproducible only after a cents→dollars conversion
  cents: number
  // * reproducible exactly as list × (1 - discount)
  exact: number
  // * not reproducible from any SKU — the ratio that came closest, as a hint at the conversion
  factors: Map<string, number>
  none: number
  present: number
  slugs: Set<string>
  zero: number
}
const derivability = new Map<string, Derivability>()

for (const endpoint of latest) {
  const { pricing } = endpoint
  const discount = num(pricing.discount) ?? 0
  const discounted = Object.values(endpoint.pricing_json).flatMap((value) => {
    const list = num(value)
    return list === null ? [] : [list * (1 - discount)]
  })

  for (const [key, value] of Object.entries(pricing)) {
    const shown = num(value)
    if (key === 'discount' || shown === null) {
      continue
    }
    const entry = derivability.get(key) ?? {
      cents: 0,
      exact: 0,
      factors: new Map<string, number>(),
      none: 0,
      present: 0,
      slugs: new Set<string>(),
      zero: 0,
    }
    entry.present += 1

    if (shown === 0) {
      entry.zero += 1
    } else if (discounted.some((price) => near(price, shown))) {
      entry.exact += 1
    } else if (discounted.some((price) => near(price / 100, shown))) {
      entry.cents += 1
    } else {
      entry.none += 1
      entry.slugs.add(endpoint.model_variant_slug)
      const ratios = discounted
        .map((price) => shown / price)
        .filter((ratio) => Number.isFinite(ratio) && ratio > 0)
      const [closest] = ratios.toSorted((a, b) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)))
      if (closest !== undefined) {
        const label = closest.toPrecision(4)
        entry.factors.set(label, (entry.factors.get(label) ?? 0) + 1)
      }
    }
    derivability.set(key, entry)
  }
}

report.push(
  '## Is `pricing` derivable from `pricing_json` and `discount`?',
  '',
  `Newest pass only, ${latest.length} endpoints. **exact** = the key equals some SKU price ×`,
  '(1 − discount) to nine significant figures. **cents** = equals it after a cents→dollars',
  'conversion. **none** = no SKU explains it, so the number exists only in this view.',
  '',
  ...table(
    ['pricing key', 'present', 'exact', 'cents', 'zero', 'none'],
    [...derivability]
      .toSorted(([, a], [, b]) => b.none - a.none || b.present - a.present)
      .map(([key, entry]) => [
        `\`${key}\``,
        `${entry.present}`,
        `${entry.exact}`,
        `${entry.cents}`,
        `${entry.zero}`,
        entry.none === 0 ? '0' : `**${entry.none}**`,
      ]),
  ),
  'For the unreproducible ones, the ratio closest to 1× against any SKU — a repeated ratio is a',
  'unit conversion we could learn, scattered ratios mean the number comes from outside the data.',
  '',
  ...table(
    ['pricing key', 'unreproducible', 'closest ratios', 'example models'],
    [...derivability]
      .filter(([, entry]) => entry.none > 0)
      .toSorted(([, a], [, b]) => b.none - a.none)
      .map(([key, entry]) => [
        `\`${key}\``,
        `${entry.none}`,
        [...entry.factors]
          .toSorted(([, a], [, b]) => b - a)
          .slice(0, 4)
          .map(([ratio, count]) => `${ratio}×${count}`)
          .join(', '),
        [...entry.slugs].slice(0, 3).join(', '),
      ]),
  ),
)

const outPath = `${outputDir}pricing-changes_${selected.at(-1)}.md`
await Bun.write(outPath, `${report.join('\n')}\n`)
console.log(`[pricing] wrote ${outPath}`)
