import { formatPercent, formatPrice } from '../../../numbers'
import type { AlertChange, AlertFact } from '../../shared/alerts/curate'
import { fact } from '../../shared/alerts/facts'
import { priceMeters as meters } from '../../shared/alerts/pricing'
import { code, field, valueChange } from './display'
import { delta, fieldChange, fieldName } from './fields'

export const priceLabel = (name: string): string => meters[name]?.label ?? fieldName(name)

const price = (name: string, rate: string) =>
  formatPrice(rate, meters[name]?.scale ?? 0) ?? `$${rate}`

export function pricingFacts(facts: readonly AlertFact[], scheduled: boolean | undefined): string {
  const discount = fact(facts, 'pricing.discount', 'percent')?.value ?? 0

  const prices = pricingTable([
    ...Object.keys(meters).flatMap((name) => {
      const rate = fact(facts, name, 'price')?.value

      return rate === undefined || rate === null
        ? []
        : [{ after: price(name, rate), annotation: '', path: name }]
    }),
    ...(discount === 0
      ? []
      : [
          {
            after: formatPercent(discount) ?? String(discount),
            annotation: '',
            path: 'pricing.discount',
          },
        ]),
  ])

  return [prices, scheduled === true ? 'Price schedule detected.' : ''].filter(Boolean).join('\n')
}

/** Pricing owns grouping, aliases, unit scaling, and fallback presentation for its fields. */
export function pricingChanges(changes: AlertChange[]): string[] {
  const rows: PriceRow[] = []
  const fallback: string[] = []

  for (const change of changes) {
    if (change.kind === 'opaque' && change.field === 'pricing.overrides') {
      fallback.push('Price schedule changed.')
      continue
    }

    const row = pricingChange(change)

    if (row === null) {
      fallback.push(fieldChange(change, { label: priceLabel(change.field) }))
    } else {
      rows.push(row)
    }
  }

  return [pricingTable(rows), ...fallback].filter(Boolean)
}

/** Rates and discounts form the price table; anything else uses the ordinary field renderer. */
function pricingChange(change: AlertChange): PriceRow | null {
  if (change.kind === 'percent') {
    // A zero discount is no discount: moving from or to zero adds or removes it.
    const percent = (value: number) => formatPercent(value) ?? String(value)

    return {
      after: change.after === 0 ? undefined : percent(change.after),
      annotation: '',
      before: change.before === 0 ? undefined : percent(change.before),
      change: changeKind(change.after === 0, change.before === 0),
      path: change.field,
    }
  }

  if (change.kind !== 'price') {
    return null
  }

  const { before, after } = change

  return {
    after: after === null ? undefined : price(change.field, after),
    // Unquoted prices are not zero-price quotes.
    annotation:
      before === null || after === null ? '' : delta(before, after, { lowerIsBetter: true }),
    before: before === null ? undefined : price(change.field, before),
    change: changeKind(after === null, before === null),
    path: change.field,
  }
}

type PriceRow = {
  path: string
  before?: string
  after?: string
  annotation: string
  change?: 'added' | 'removed'
}

export function pricingTable(rows: PriceRow[]): string {
  // Collapse before measuring/padding: `≈ $0.684` must occupy the same value
  // column as `$2.50`, rather than an outside ≈ shifting the code span right.
  const displayRows = rows.map((row) =>
    row.before !== undefined && row.before === row.after
      ? { ...row, after: `≈ ${row.after}`, before: undefined }
      : row,
  )

  // Include the external marker in the row width, then subtract it from code-span padding.
  const labelWidth = Math.max(
    ...rows.map((row) => priceLabel(row.path).length + (row.change === undefined ? 0 : 2)),
  )

  const valueWidth = Math.max(
    ...displayRows.flatMap((row) => [row.before?.length ?? 0, row.after?.length ?? 0]),
  )

  return displayRows
    .toSorted(
      (a, b) => Number(a.path === 'pricing.discount') - Number(b.path === 'pricing.discount'),
    )
    .map((row) => {
      const cell = (value: string | undefined) =>
        value === undefined ? undefined : code(value, { align: 'right', width: valueWidth })

      return field(
        priceLabel(row.path),
        valueChange(cell(row.before), cell(row.after), { annotation: row.annotation }),
        { change: row.change, width: labelWidth - (row.change === undefined ? 0 : 2) },
      )
    })
    .join('\n')
}

function changeKind(removed: boolean, added: boolean): 'removed' | 'added' | undefined {
  if (removed) {
    return 'removed'
  }

  return added ? 'added' : undefined
}
