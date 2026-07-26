// * Analysis helper: what the sampling interval does to what we "know".
// *
// * Every change count in the other reports is a property of the 15-minute cadence, not of the
// * world. A snapshot-diff pipeline cannot tell you otherwise, because the only thing it can see is
// * the difference between two arbitrary observation times. This resamples the mirrored passes at
// * coarser intervals and shows what each answer becomes — which is the honest way to choose a
// * cadence, and also the clearest statement of what is wrong with organising capture around a
// * whole-catalogue snapshot in the first place.
// *
// * Careful about what "missed" means. At any interval, the state AT a sample time is exact; what
// * coarsening loses is intermediate states — a value that moves and returns inside one window was
// * never there as far as the pipeline is concerned. So the interesting columns are the ones that
// * SHOULD be invariant (real repricings, births, deaths) and the ones that are pure artifacts
// * (transition counts, travelled distance).
// * Run: bun run cadence
import { canonicalizeEndpoints } from '../canonicalize/endpoints.ts'
import { mirroredPasses, readPass } from '../canonicalize/pass.ts'

const outputDir = new URL('../../output/', import.meta.url).pathname

// * capture currently runs every 15 minutes; multiples of it are the cadences we could choose
const BASE_MINUTES = 15
const EVERY = [1, 2, 4, 8, 16] as const

// * fields that are neither telemetry nor a pricing view — a change here is a real change to what
// * the offering IS, and no cadence should be able to lose one that persists
const PRICING_VIEWS = new Set(['pricing', 'display_pricing', 'pricing_json', 'pricing_version_id'])
const isDurable = (field: string) => field !== 'status' && !PRICING_VIEWS.has(field)

const passes = mirroredPasses()
if (passes.length < 2) {
  throw new Error('need at least two mirrored passes')
}

// * read every pass once, reduced to just what the comparisons need — full canonical endpoints for
// * 40 passes will not fit comfortably, and this is all that is used
type Snapshot = Map<string, { effective: number; fields: Record<string, string>; label: string }>
const snapshots: Array<{ captured_at: string; endpoints: Snapshot }> = []

for (const captured_at of passes) {
  const pass = await readPass(captured_at)
  const endpoints: Snapshot = new Map()
  for (const endpoint of canonicalizeEndpoints(pass.scopes.flatMap((scope) => scope.endpoints))) {
    const fields: Record<string, string> = {}
    for (const [field, value] of Object.entries(endpoint)) {
      fields[field] = JSON.stringify(value) ?? 'undefined'
    }
    endpoints.set(endpoint.id, {
      effective: Number(endpoint.pricing.prompt) * 1e6,
      fields,
      label: `${endpoint.provider_slug} | ${endpoint.model_variant_slug}`,
    })
  }
  snapshots.push({ captured_at, endpoints })
  console.log(`[cadence] read ${captured_at}`)
}

type Result = {
  births: number
  deaths: number
  durableChanges: number
  every: number
  maxStep: number
  minutes: number
  passes: number
  pricingChanges: number
  statusChanges: number
  travelled: number
  // * biggest single observed jump on the two endpoints running the price war, which is the number
  // * an amplitude threshold would have to survive
  warMaxStep: number
}

// * the model the two undercutting providers are fighting over — the flapping we need an amplitude
// * threshold to survive
const WAR_MODEL = 'glm-5.2'

const measure = (every: number): Result => {
  const sampled = snapshots.filter((_, index) => index % every === 0)
  const result: Result = {
    births: 0,
    deaths: 0,
    durableChanges: 0,
    every,
    maxStep: 0,
    minutes: every * BASE_MINUTES,
    passes: sampled.length,
    pricingChanges: 0,
    statusChanges: 0,
    travelled: 0,
    warMaxStep: 0,
  }

  for (let index = 1; index < sampled.length; index += 1) {
    const before = sampled[index - 1]?.endpoints
    const after = sampled[index]?.endpoints
    if (before === undefined || after === undefined) {
      continue
    }

    for (const [id, now] of after) {
      const was = before.get(id)
      if (was === undefined) {
        result.births += 1
        continue
      }
      for (const [field, value] of Object.entries(now.fields)) {
        if (was.fields[field] === value) {
          continue
        }
        if (field === 'status') {
          result.statusChanges += 1
        } else if (PRICING_VIEWS.has(field)) {
          result.pricingChanges += 1
        } else if (isDurable(field)) {
          result.durableChanges += 1
        }
      }

      const step = Math.abs(now.effective - was.effective)
      if (Number.isFinite(step) && step > 0) {
        result.travelled += step
        result.maxStep = Math.max(result.maxStep, step)
        if (now.label.includes(WAR_MODEL)) {
          result.warMaxStep = Math.max(result.warMaxStep, step)
        }
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) {
        result.deaths += 1
      }
    }
  }

  return result
}

const results = EVERY.map(measure)
const [baseline] = results
if (baseline === undefined) {
  throw new Error('no baseline')
}

// * ── real existence events, and when each cadence would have noticed ────────────────────────
// * Counting births per cadence is misleading: an event near the end of the window looks "lost"
// * when it is only late. So find the events at full resolution, then ask each cadence when it
// * would first have seen each one.
type Event = { at: number; kind: 'born' | 'died'; label: string }
const events: Event[] = []
for (let index = 1; index < snapshots.length; index += 1) {
  const before = snapshots[index - 1]?.endpoints
  const after = snapshots[index]?.endpoints
  if (before === undefined || after === undefined) {
    continue
  }
  for (const [id, now] of after) {
    if (!before.has(id)) {
      events.push({ at: index, kind: 'born', label: now.label })
    }
  }
  for (const [id, was] of before) {
    if (!after.has(id)) {
      events.push({ at: index, kind: 'died', label: was.label })
    }
  }
}

// * the first sampled pass at or after the event, which is when that cadence could first know
const noticedAt = (every: number, at: number) => {
  const sampled = snapshots.map((_, index) => index).filter((index) => index % every === 0)
  const first = sampled.find((index) => index >= at)
  return first === undefined ? null : (first - at) * BASE_MINUTES
}

const table = (header: string[], rows: string[][]) => [
  `| ${header.join(' | ')} |`,
  `| ${header.map(() => '---').join(' | ')} |`,
  ...rows.map((row) => `| ${row.join(' | ')} |`),
  '',
]

const pct = (value: number, of: number) => (of === 0 ? '—' : `${Math.round((value / of) * 100)}%`)

const window = `${passes.length} passes, \`${passes[0]}\` → \`${passes.at(-1)}\``

const report = [
  '# What the sampling interval does to what we know',
  '',
  `${window}. Generated by \`bun run cadence\`.`,
  '',
  'The mirrored passes resampled at multiples of the 15-minute capture interval. **The state at a',
  'sample time is always exact** — what a coarser interval loses is intermediate states, so a value',
  'that moves and comes back inside one window never happened as far as the pipeline is concerned.',
  '',
  '## Counts at each cadence',
  '',
  ...table(
    [
      'interval',
      'passes',
      'requests',
      'durable changes',
      '`status` changes',
      'pricing-view changes',
      'births',
      'deaths',
    ],
    results.map((result) => [
      `${result.minutes} min`,
      `${result.passes}`,
      // * a pass is 1 catalog request plus one per scope; scope count is stable at ~433
      `~${(result.passes * 433).toLocaleString()}`,
      `${result.durableChanges}`,
      `${result.statusChanges}`,
      `${result.pricingChanges}`,
      `${result.births}`,
      `${result.deaths}`,
    ]),
  ),
  '⚠️ Read the `status` column as an artifact, not a measurement: it shrinks almost exactly in',
  'proportion to the number of times we looked, which is what it means for a number to be a property',
  'of the observer rather than the observed. The pricing-view column does NOT scale that way, and the',
  'difference is the finding: it decomposes into a persistent part (real repricings, still visible at',
  'any interval) and a sampling-proportional part (the undercutting war).',
  '',
  'Durable changes falling from 4 to 1 is a third effect again, and not transience — none of the four',
  'ever reverted. Three of them landed on an endpoint one pass AFTER it was born, so a coarser',
  'interval first observes that endpoint already in its changed state and attributes nothing to a',
  'field. ⚠️ Worth knowing on its own: a newly appeared endpoint changes capability fields while it',
  'settles, so its first observation is not a reliable baseline.',
  '',
  '## Effective price movement',
  '',
  'Dollars per million prompt tokens, summed over all endpoints. `travelled` is every step added up;',
  '`largest step` is the biggest single jump any endpoint appeared to make.',
  '',
  ...table(
    ['interval', 'travelled', 'vs 15 min', 'largest step', 'largest step on a glm-5.2 endpoint'],
    results.map((result) => [
      `${result.minutes} min`,
      `$${result.travelled.toFixed(4)}`,
      pct(result.travelled, baseline.travelled),
      `$${result.maxStep.toFixed(4)}`,
      `$${result.warMaxStep.toFixed(4)}`,
    ]),
  ),
  '⚠️ The last column is the one that decides whether an amplitude threshold survives coarsening. If',
  'undersampling makes a flap look like a large step, the threshold stops separating the price war',
  'from real repricing, and the two become indistinguishable without more frequent observation.',
  '',
  '## Discovery latency',
  '',
  'The real existence events in this window, and how late each cadence would have been. ⚠️ A `—`',
  'means the event falls after the last sample that cadence takes, so it is not yet known at the end',
  'of the window — late, not lost. ⚠️ No model launched in these ten hours, so endpoint births are',
  'all we have to go on.',
  '',
  ...table(
    ['event', 'at', ...results.map((result) => `${result.minutes} min`)],
    events.map((event) => [
      `${event.kind} \`${event.label}\``,
      `pass ${event.at}`,
      ...results.map((result) => {
        const late = noticedAt(result.every, event.at)
        return late === null ? '—' : `+${late} min`
      }),
    ]),
  ),
  'And the arithmetic, which is the part that generalises: nothing about a whole-catalogue sweep',
  'lets discovery be faster than the sweep.',
  '',
  ...table(
    ['interval', 'average latency', 'worst case', 'sweeps per day', 'requests per day'],
    results.map((result) => [
      `${result.minutes} min`,
      `${result.minutes / 2} min`,
      `${result.minutes} min`,
      (1440 / result.minutes).toFixed(1),
      `~${Math.round((1440 / result.minutes) * 433).toLocaleString()}`,
    ]),
  ),
  'The catalogue is **one** request of the ~433, and it is where a new model first appears. So the',
  'two things a cadence has to buy — fast discovery and low churn — are only in tension because one',
  'sweep does both. Polling the catalogue alone costs 0.2% of a pass.',
  '',
]

const outPath = `${outputDir}cadence_${passes.at(-1)}.md`
await Bun.write(outPath, `${report.join('\n')}\n`)
console.log(`[cadence] wrote ${outPath}`)
