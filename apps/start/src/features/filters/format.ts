import type { RangeFacet } from '#features/endpoints/filters'

/** Dollars per million tokens: at least two decimals, more only when the value needs them. */
export function formatPrice(value: number): string {
  const [, fraction = ''] = String(Number(value.toFixed(4))).split('.')

  return `$${value.toFixed(Math.max(2, fraction.length))}`
}

export function formatThroughput(value: number): string {
  return String(Math.round(value))
}

/** Token counts compactly: `8K`, `128K`, `1M`, `1.05M`. */
export function formatContext(value: number): string {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(2))}M`
  }

  return value >= 1000 ? `${Math.round(value / 1000)}K` : String(Math.round(value))
}

export function formatMonths(value: number): string {
  return `${value} mo`
}

/** Facets whose bound is a maximum or a minimum on a numeric value; `released` is a window. */
export type BoundFacet = Exclude<RangeFacet, 'released'>

const VALUE_FORMATTERS: Record<BoundFacet, (value: number) => string> = {
  maxInput: formatPrice,
  minContext: formatContext,
  minTps: formatThroughput,
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
