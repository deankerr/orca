// * Analysis helper: complete, verbatim examples of the pricing structures on real endpoints.
// * The aggregate reports say what moves and what is derivable; this one exists so a human can
// * read the actual shapes side by side and recognise what OpenRouter is doing.
// *
// * Endpoints are chosen by criteria rather than hardcoded, so the report stays honest as the data
// * changes: one clean baseline, then one endpoint per oddity we know about (a drifting discount,
// * each `pricing` key that no SKU explains, tiers, overrides, non-string values). Nothing is
// * summarised — `pricing_json`, `pricing` and `display_pricing` are printed in full.
// * Run: bun run pricing-examples [--pass <captured_at>]
import { parseArgs } from 'node:util'

import { canonicalizeEndpoints } from '../canonicalize/endpoints.ts'
import { mirroredPasses, readPass } from '../canonicalize/pass.ts'

const { values: args } = parseArgs({ options: { pass: { type: 'string' } } })

const outputDir = new URL('../../output/', import.meta.url).pathname

const captured_at = args.pass ?? mirroredPasses().at(-1)
if (captured_at === undefined) {
  throw new Error('no mirrored passes — run `bun run mirror` in apps/capture first')
}
const pass = await readPass(captured_at)
const endpoints = canonicalizeEndpoints(pass.scopes.flatMap((scope) => scope.endpoints))

// * the model record, for output modality context — the same pricing key means different things
// * in different modality groups
const modalities = new Map<string, string>()
for (const scope of pass.scopes) {
  const { model } = scope
  if (model !== null) {
    const output = model.output_modalities
    modalities.set(
      String(model.permaslug),
      Array.isArray(output) ? output.map(String).join('+') : 'unknown',
    )
  }
}

const num = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(Math.abs(a), 1e-15) * 1e-9

type Endpoint = (typeof endpoints)[number]

// * per `pricing` key: can it be reproduced from any SKU at this endpoint's discount, and if not,
// * what ratio came closest to explaining it
const explain = (endpoint: Endpoint) => {
  const { pricing } = endpoint
  const discount = num(pricing.discount) ?? 0
  const skus = Object.entries(endpoint.pricing_json).flatMap(([sku, value]) => {
    const list = num(value)
    return list === null ? [] : [[sku, list * (1 - discount)] as const]
  })

  return Object.entries(pricing).flatMap(([key, value]) => {
    const shown = num(value)
    if (key === 'discount' || shown === null || shown === 0) {
      return []
    }
    const hit = skus.find(([, price]) => near(price, shown))
    if (hit !== undefined) {
      return [{ key, note: `= \`${hit[0]}\` × (1 − ${discount})`, ok: true }]
    }
    const ratios = skus
      .map(([sku, price]) => [sku, shown / price] as const)
      .filter(([, ratio]) => Number.isFinite(ratio) && ratio > 0)
      .toSorted(([, a], [, b]) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)))
    const [closest] = ratios
    return [
      {
        key,
        note:
          closest === undefined
            ? '**no numeric SKU on this endpoint at all**'
            : `**unexplained** — closest is \`${closest[0]}\` × ${closest[1].toPrecision(4)}`,
        ok: false,
      },
    ]
  })
}

const unexplained = (endpoint: Endpoint, key: string) =>
  explain(endpoint).some((entry) => entry.key === key && !entry.ok)

const discountOf = (endpoint: Endpoint) => num(endpoint.pricing.discount) ?? 0

// * one case worth reading, and why it was picked. `find` order follows the endpoint sort, so the
// * same criteria pick the same examples run to run unless the data itself moved.
const CASES: Array<{ pick: (endpoint: Endpoint) => boolean; title: string; why: string }> = [
  {
    pick: (endpoint) =>
      discountOf(endpoint) === 0 &&
      Object.keys(endpoint.pricing_json).length >= 4 &&
      modalities.get(endpoint.model_variant_permaslug) === 'text',
    title: 'Baseline: a text endpoint with no discount',
    why: 'What the three views look like when nothing unusual is happening. Every `pricing` number here should be a plain copy of a SKU.',
  },
  {
    pick: (endpoint) => {
      const discount = discountOf(endpoint)
      // * a non-round discount is the signature of the endpoints whose effective price drifts
      return discount > 0 && Math.abs(discount * 100 - Math.round(discount * 100)) > 1e-9
    },
    title: 'A discounted endpoint whose rate is not a round number',
    why: 'These are the ones whose `discount` drifts by fractions of a percent every pass, moving three `pricing` keys and every `display_pricing` row with it while `pricing_json` stands still.',
  },
  {
    pick: (endpoint) => discountOf(endpoint) >= 0.3 && discountOf(endpoint) <= 0.4,
    title: 'A discounted endpoint with a round rate',
    why: 'For comparison with the above — same mechanism, but the rate sits still.',
  },
  {
    pick: (endpoint) => unexplained(endpoint, 'web_search'),
    title: '`pricing.web_search` with nothing behind it',
    why: 'On 71 endpoints this number matches no SKU at any discount. If it is OpenRouter charging for their own web search rather than the provider charging, this view is the only place it exists.',
  },
  {
    pick: (endpoint) => unexplained(endpoint, 'input_cache_write'),
    title: '`pricing.input_cache_write` at a ratio like 5/6 or 15/16',
    why: 'Looks like a duration conversion — the SKUs mention cache write storage *hours*, and the shown number is a fraction of one. The factor is not in the data.',
  },
  {
    pick: (endpoint) =>
      unexplained(endpoint, 'image_token') || unexplained(endpoint, 'image_output'),
    title: 'An image endpoint: per-image cents vs per-token dollars',
    why: 'The SKUs are priced per image (or per megapixel, in cents); `pricing` shows a per-token dollar figure. The conversion factor repeated on 18 endpoints, so it is probably a fixed convention we could learn — but we would be inferring it.',
  },
  {
    pick: (endpoint) => Object.keys(endpoint.pricing).includes('overrides'),
    title: '`pricing.overrides` — context-threshold tiering',
    why: 'Non-numeric, on 78 endpoints, and currently not stored anywhere. Probably the same concern as `tiers`.',
  },
  {
    pick: (endpoint) => endpoint.tiers !== null,
    title: '`tiers` — flex / priority pricing variants',
    why: 'On ~53 endpoints. Unmodelled: the likely home is a third key column on the pricing lane, `(endpoint, tier, sku)`.',
  },
  {
    pick: (endpoint) =>
      Object.values(endpoint.pricing_json).some((value) => typeof value !== 'string'),
    title: 'A `pricing_json` shipping raw numbers instead of decimal strings',
    why: 'Everything else uses strings, which is what preserves precision. ⚠️ A JSON number here has already lost whatever the provider actually set.',
  },
]

const block = (label: string, value: unknown) => [
  `**${label}**`,
  '',
  '```json',
  JSON.stringify(value, null, 2),
  '```',
  '',
]

const report = [
  '# Pricing structures, verbatim',
  '',
  `Pass \`${captured_at}\`, ${endpoints.length} endpoints. Generated by \`bun run pricing-examples\`.`,
  '',
  'One endpoint per case, printed in full — nothing summarised or truncated. The derivation table',
  'under each shows, for every numeric key of `pricing`, which `pricing_json` SKU reproduces it at',
  "that endpoint's discount, or that nothing does.",
  '',
]

const used = new Set<string>()
for (const { pick, title, why } of CASES) {
  const endpoint = endpoints.find((candidate) => pick(candidate) && !used.has(candidate.id))
  if (endpoint === undefined) {
    report.push(`## ${title}`, '', `_No endpoint matched this case in this pass._`, '')
    continue
  }
  used.add(endpoint.id)

  const derivation = explain(endpoint)
  report.push(
    `## ${title}`,
    '',
    why,
    '',
    `\`${endpoint.model_variant_slug}\` @ \`${endpoint.provider_slug}\` — provider \`${endpoint.provider_name}\`,`,
    `id \`${endpoint.id}\`, output modality \`${modalities.get(endpoint.model_variant_permaslug) ?? 'unknown'}\`,`,
    `quantization \`${endpoint.quantization}\`, discount \`${discountOf(endpoint)}\`.`,
    '',
    ...block('pricing_json (list prices, source of truth)', endpoint.pricing_json),
    ...block('pricing (OpenRouter normalized view)', endpoint.pricing),
    ...block('display_pricing (presentation view)', endpoint.display_pricing),
    ...(endpoint.tiers === null ? [] : block('tiers', endpoint.tiers)),
    '**derivation of each `pricing` key**',
    '',
    '| key | shown | explanation |',
    '| --- | --- | --- |',
    ...derivation.map((entry) => {
      const shown = endpoint.pricing[entry.key]
      return `| \`${entry.key}\` | \`${JSON.stringify(shown)}\` | ${entry.note} |`
    }),
    '',
  )
}

const outPath = `${outputDir}pricing-examples_${captured_at}.md`
await Bun.write(outPath, `${report.join('\n')}\n`)
console.log(`[pricing] wrote ${outPath}`)
