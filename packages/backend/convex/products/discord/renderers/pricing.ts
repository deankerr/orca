import type { AlertChange, AlertFact } from '../../shared/alerts/curate'
import {
  fact,
  fieldLabel,
  formatQuantity,
  presentChange,
  priceFields,
} from '../../shared/alerts/present'
import { code, field, valueChange } from './display'
import { delta, fieldChange } from './fields'

const price = (name: string, value: string) => formatQuantity({ field: name, kind: 'price', value })

export function pricingFacts(facts: readonly AlertFact[], scheduled: boolean | undefined): string {
  const discount = fact(facts, 'pricing.discount', 'percent')?.value ?? 0

  const prices = pricingTable([
    ...Object.keys(priceFields).flatMap((name) => {
      const rate = fact(facts, name, 'price')?.value

      return rate === undefined || rate === null
        ? []
        : [{ after: price(name, rate), annotation: '', path: name }]
    }),
    ...(discount === 0
      ? []
      : [
          {
            after: formatQuantity({ field: 'pricing.discount', kind: 'percent', value: discount }),
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
      fallback.push(fieldChange(change))
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
    const percent = (value: number) =>
      value === 0 ? undefined : formatQuantity({ field: change.field, kind: 'percent', value })

    const [before, after] = [percent(change.before), percent(change.after)]

    return { after, annotation: '', before, change: presence(before, after), path: change.field }
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
    ...rows.map((row) => fieldLabel(row.path).length + (row.change === undefined ? 0 : 2)),
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
        fieldLabel(row.path),
        valueChange(cell(row.before), cell(row.after), { annotation: row.annotation }),
        { change: row.change, width: labelWidth - (row.change === undefined ? 0 : 2) },
      )
    })
    .join('\n')
}

/** A row whose side is absent was added or removed. */
function presence(before: string | undefined, after: string | undefined) {
  if (after === undefined) {
    return 'removed'
  }

  return before === undefined ? 'added' : undefined
}
