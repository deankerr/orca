import type { FieldChange, FieldValue } from '../curate'
import { formatPercent, formatPrice } from '../numbers'
import { code, field, valueChange } from './display'
import { delta, fieldChange, fieldName, fieldValue } from './fields'

const meters: Record<string, { label: string; places: number }> = {
  'pricing.prompt': { label: 'input', places: 6 },
  'pricing.completion': { label: 'output', places: 6 },
  'pricing.input_cache_read': { label: 'cache_read', places: 6 },
  'pricing.input_cache_write': { label: 'cache_write', places: 6 },
  'pricing.input_cache_write_1h': { label: 'cache_write_1h', places: 6 },
  'pricing.audio': { label: 'audio_input', places: 6 },
  'pricing.input_audio_cache': { label: 'audio_cache', places: 6 },
  'pricing.image': { label: 'image_input', places: 3 },
  'pricing.image_output': { label: 'image_output', places: 3 },
  'pricing.web_search': { label: 'web_search', places: 0 },
}

export const priceLabel = (path: string): string => meters[path]?.label ?? fieldName(path)

export function pricingFacts(facts: Record<string, FieldValue>): string {
  return pricingTable(
    [...Object.keys(meters), 'pricing.discount'].flatMap((path) => {
      const { pricing } = facts

      const input =
        pricing !== null && typeof pricing === 'object' && !Array.isArray(pricing)
          ? pricing[path.slice('pricing.'.length)]
          : undefined

      const after = input === undefined ? null : priceValue(path, input)

      return after === null || (path === 'pricing.discount' && input === 0)
        ? []
        : [{ path, after, annotation: '' }]
    }),
  )
}

/** Pricing owns grouping, aliases, unit scaling, and fallback presentation for its fields. */
export function pricingChanges(changes: FieldChange[]): string[] {
  const rows: PriceRow[] = []
  const fallback: string[] = []

  for (const change of changes) {
    const row = pricingChange(change)

    if (row === null) {
      fallback.push(
        fieldChange(change, {
          label: priceLabel(change.path),
          formatValue: pricingValue,
          annotation:
            change.type === 'field_updated'
              ? priceDelta(change.before, change.after, change.path)
              : '',
        }),
      )
    } else {
      rows.push(row)
    }
  }

  return [pricingTable(rows), ...fallback].filter(Boolean)
}

function pricingValue(value: FieldValue, path: string): string {
  const price = priceValue(path, value)

  if (price !== null) {
    return code(price)
  }

  return typeof value === 'string' && value.trim() !== '' && meters[path] !== undefined
    ? fieldValue(`$${value}`)
    : fieldValue(value)
}

/** A null row leaves unfamiliar/non-price values to the ordinary field renderer. */
function pricingChange(change: FieldChange): PriceRow | null {
  if (change.type === 'set_updated') {
    return null
  }

  const before = 'before' in change ? priceValue(change.path, change.before) : undefined
  const after = 'after' in change ? priceValue(change.path, change.after) : undefined

  if (before === null || after === null) {
    return null
  }

  const discount = change.path === 'pricing.discount'

  const removed =
    change.type === 'field_removed' ||
    (discount && change.type === 'field_updated' && change.after === 0)

  const added =
    change.type === 'field_added' ||
    (discount && change.type === 'field_updated' && change.before === 0)

  return {
    path: change.path,
    before: added ? undefined : before,
    after: removed ? undefined : after,
    change: removed ? 'removed' : added ? 'added' : undefined,
    annotation:
      !removed && !added && change.type === 'field_updated'
        ? priceDelta(change.before, change.after, change.path)
        : '',
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
      ? { ...row, before: undefined, after: `≈ ${row.after}` }
      : row,
  )

  const labelWidth = Math.max(...rows.map((row) => priceLabel(row.path).length))

  const valueWidth = Math.max(
    ...displayRows.flatMap((row) => [row.before?.length ?? 0, row.after?.length ?? 0]),
  )

  return displayRows
    .toSorted(
      (a, b) => Number(a.path === 'pricing.discount') - Number(b.path === 'pricing.discount'),
    )
    .map((row) => {
      const cell = (value: string | undefined) =>
        value === undefined ? undefined : code(value, { width: valueWidth, align: 'right' })

      return field(
        priceLabel(row.path),
        valueChange(cell(row.before), cell(row.after), { annotation: row.annotation }),
        { width: labelWidth, change: row.change },
      )
    })
    .join('\n')
}

function priceValue(path: string, input: FieldValue): string | null {
  if (path === 'pricing.discount' && typeof input === 'number') {
    return formatPercent(input)
  }

  const meter = meters[path]

  return meter !== undefined && typeof input === 'string' ? formatPrice(input, meter.places) : null
}

function priceDelta(before: FieldValue, after: FieldValue, path: string): string {
  if (path === 'pricing.discount') {
    return ''
  }

  if (meters[path] === undefined) {
    return delta(before, after)
  }

  // Unknown/blank prices are not zero-price quotes.
  return typeof before === 'string' &&
    before.trim() !== '' &&
    typeof after === 'string' &&
    after.trim() !== ''
    ? delta(before, after, { lowerIsBetter: true })
    : ''
}
