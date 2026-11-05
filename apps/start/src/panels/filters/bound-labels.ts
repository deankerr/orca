import type { RangeFacet } from '#endpoints/filtering'
import { formatContext } from '#lib/format'

/** A price bound in dollars per million tokens: at least two decimals, more only when the value needs them. */
export function formatPriceBound(value: number): string {
  const [, fraction = ''] = String(Number(value.toFixed(4))).split('.')

  return `$${value.toFixed(Math.max(2, fraction.length))}`
}

export function formatThroughputBound(value: number): string {
  return String(Math.round(value))
}

export function formatMonths(value: number): string {
  return `${value} mo`
}

/** Facets whose bound is a maximum or a minimum on a numeric value; `released` is a window. */
export type BoundFacet = Exclude<RangeFacet, 'released'>

const VALUE_FORMATTERS: Record<BoundFacet, (value: number) => string> = {
  maxInput: formatPriceBound,
  minContext: formatContext,
  minTps: formatThroughputBound,
}

const BOUND_OPERATORS: Record<BoundFacet, '≤' | '≥'> = {
  maxInput: '≤',
  minContext: '≥',
  minTps: '≥',
}

/** A bound's value alone: `$1.00`, `100`, `128K`. */
function formatBoundValue(facet: BoundFacet, value: number): string {
  return VALUE_FORMATTERS[facet](value)
}

/** A bound with its operator, as shown beside the facet label: `≤ $1.00`. */
export function formatBound(facet: BoundFacet, value: number): string {
  return `${BOUND_OPERATORS[facet]} ${formatBoundValue(facet, value)}`
}

/** The release window as shown beside its label: `last 6 mo`. */
export function formatReleaseWindow(months: number): string {
  return `last ${formatMonths(months)}`
}
