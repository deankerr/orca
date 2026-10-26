import type { AlertChange, AlertFact } from '../../shared/alerts/curate'
import { findFact, fieldLabel, formatQuantity, presentChange } from '../../shared/alerts/present'
import { changeRow, dot, presence, valueChange } from './display'
import { delta, fieldChange } from './fields'

const price = (name: string, value: string) => formatQuantity({ field: name, kind: 'price', value })

/** A family's rates share a line in key order; `carry` families fold an unlisted rate's label into the next. */
type PriceFamily = { carry: boolean; labels: Record<string, string> }

/** Listing lines in order; text rates come first and carry the discount. Web search is not listed. */
const priceFamilies: PriceFamily[] = [
  { carry: false, labels: { 'pricing.input': 'Input', 'pricing.output': 'Output' } },
  {
    carry: true,
    labels: {
      'pricing.input_cache_read': 'Cache',
      'pricing.input_cache_write': 'Write',
      'pricing.input_cache_write_1h': '1Hr',
    },
  },
  { carry: true, labels: { 'pricing.image': 'Image', 'pricing.image_output': 'Output' } },
  {
    carry: true,
    labels: {
      'pricing.audio': 'Audio',
      'pricing.audio_output': 'Output',
      'pricing.input_audio_cache': 'Cache',
    },
  },
]

/** Listing price lines, such as `**Input** $2.00 • **Output** $10.00 • **Discount** 50%`. */
export function pricingSummary(facts: readonly AlertFact[]): string[] {
  const discount = findFact(facts, 'pricing.discount', 'percent')

  const [textRates = [], ...otherRates] = priceFamilies.map((family) => familyRates(facts, family))

  const lines = [
    discount === undefined || discount.value === 0
      ? textRates
      : [...textRates, `**Discount** ${formatQuantity(discount)}`],
    ...otherRates,
  ]

  return lines.flatMap((rates) => (rates.length === 0 ? [] : [rates.join(dot)]))
}

/** `**Cache** **Write** $2.50`: without a cache-read rate, its label introduces the write rate. */
function familyRates(facts: readonly AlertFact[], { carry, labels }: PriceFamily): string[] {
  const rates: string[] = []
  let carried: string[] = []

  for (const [name, label] of Object.entries(labels)) {
    const rate = findFact(facts, name, 'price')?.value
    const heading = [...carried, label]

    if (rate === undefined || rate === null) {
      carried = carry ? heading : []
    } else {
      rates.push(`${heading.map((word) => `**${word}**`).join(' ')} ${price(name, rate)}`)
      carried = []
    }
  }

  return rates
}

/** Pricing owns grouping, aliases, unit scaling, and fallback presentation for its fields. */
export function pricingChanges(changes: AlertChange[]): string[] {
  const rows: PriceRow[] = []
  const fallback: string[] = []

  for (const change of changes) {
    if (change.kind === 'opaque' && change.field === 'pricing.overrides') {
      fallback.push('- Price schedule changed.')
      continue
    }

    const row = pricingChange(change)

    if (row === null) {
      fallback.push(fieldChange(change))
    } else {
      rows.push(row)
    }
  }

  return [priceList(rows), ...fallback].filter(Boolean)
}

/** Rates and discounts form the price list; anything else uses the ordinary field renderer. */
function pricingChange(change: AlertChange): PriceRow | null {
  if (change.kind === 'percent') {
    // A zero discount is no discount: moving from or to zero adds or removes it.
    const percent = (value: number) =>
      value === 0 ? undefined : formatQuantity({ field: change.field, kind: 'percent', value })

    const [before, after] = [percent(change.before), percent(change.after)]

    return { after, annotation: '', before, change: transition(before, after), path: change.field }
  }

  if (change.kind !== 'price') {
    return null
  }

  // Unquoted prices are not zero-price quotes.
  const rate = (value: string | null) => (value === null ? undefined : price(change.field, value))
  const presented = presentChange(change, { fractionDigits: 0 })

  return {
    after: rate(change.after),
    annotation:
      presented.transition === 'updated' && presented.movement !== null
        ? delta(presented.movement)
        : '',
    before: rate(change.before),
    change:
      presented.transition === 'added' || presented.transition === 'removed'
        ? presented.transition
        : undefined,
    path: change.field,
  }
}

/** A side is absent when the price was added or removed. */
type PriceRow = {
  path: string
  before?: string | undefined
  after?: string | undefined
  annotation: string
  change?: 'added' | 'removed' | undefined
}

/** Listing order, then fields outside it, such as web search, then any discount. */
const priceOrder = priceFamilies.flatMap(({ labels }) => Object.keys(labels))

function rank(field: string): number {
  if (field === 'pricing.discount') {
    return priceOrder.length + 1
  }

  const index = priceOrder.indexOf(field)

  return index === -1 ? priceOrder.length : index
}

/** `- **Input** $0.02 → $0.0691 🔺245%`, one bullet per rate. */
export function priceList(rows: PriceRow[]): string {
  return rows
    .toSorted((a, b) => rank(a.path) - rank(b.path))
    .map((row) => changeRow(priceLabel(row.path), priceRowValue(row)))
    .join('\n')
}

function priceRowValue({ before, after, annotation, change }: PriceRow): string {
  if (change === 'removed' && before !== undefined) {
    return presence(before, 'removed')
  }

  if (change === 'added' && after !== undefined) {
    return presence(after, 'added')
  }

  return valueChange(before, after, { annotation })
}

/** A rate's full listing label, such as Cache Write or Image Output, when it stands alone. */
function priceLabel(field: string): string {
  if (field === 'pricing.discount') {
    return 'Discount'
  }

  if (field === 'pricing.web_search') {
    return 'Web search'
  }

  const family = priceFamilies.find(({ labels }) => field in labels)
  const [first] = Object.values(family?.labels ?? {})
  const label = family?.labels[field] ?? fieldLabel(field)

  return family?.carry === true && label !== first ? `${first} ${label}` : label
}

/** A row whose side is absent was added or removed. */
function transition(before: string | undefined, after: string | undefined) {
  if (after === undefined) {
    return 'removed'
  }

  return before === undefined ? 'added' : undefined
}
