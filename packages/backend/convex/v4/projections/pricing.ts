import { canonicalJson } from '../json'
import { SourcePricing } from '../scan/entities'
import type { PricingRow } from '../series/table'

/** Select decimal meters and preserve complete overrides; discount is already reflected in rates. */
export function selectPricing(value: unknown): PricingRow {
  const { discount, overrides, display_pricing: _display, ...source } = SourcePricing.parse(value)
  const meters = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && isMeterKey(entry[0]),
    ),
  )
  return overrides === undefined
    ? { discount, meters }
    : { discount, meters, overrides_json: canonicalJson(overrides) }
}

/** Native meter maps require Convex-safe keys; other pricing facts remain in the entity JSON. */
function isMeterKey(key: string): boolean {
  return /^[\u0020-\u007E]+$/.test(key) && !key.startsWith('$') && !key.startsWith('_')
}
