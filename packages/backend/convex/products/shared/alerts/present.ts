import { formatNumber, formatPercent, formatPrice, relativeChange } from '../../../numbers'
import { priceMeters as meters } from '../../../priceMeters'
import type { KindValues, ValueChange, ValueKind } from '../../v5/projection'
import type { AlertChange, AlertFact, AlertKind } from './curate'

interface PriceFields {
  [field: string]: { label: string; scale: number; unit: string; discounted: boolean }
}

/** Contract price fields and their alert labels use the shared meter units and decimal scaling. */
// oxlint-disable sort-keys -- Object.keys order is the price display order.
export const priceFields: PriceFields = {
  'pricing.input': { label: 'input', ...meters.prompt },
  'pricing.output': { label: 'output', ...meters.completion },
  'pricing.input_cache_read': { label: 'cache_read', ...meters.input_cache_read },
  'pricing.input_cache_write': { label: 'cache_write', ...meters.input_cache_write },
  'pricing.input_cache_write_1h': { label: 'cache_write_1h', ...meters.input_cache_write_1h },
  'pricing.audio': { label: 'audio_input', ...meters.audio },
  'pricing.audio_output': { label: 'audio_output', ...meters.audio_output },
  'pricing.input_audio_cache': { label: 'audio_cache', ...meters.input_audio_cache },
  'pricing.image': { label: 'image_input', ...meters.image },
  'pricing.image_output': { label: 'image_output', ...meters.image_output },
  'pricing.web_search': { label: 'web_search', ...meters.web_search },
}
// oxlint-enable sort-keys

interface Labels {
  [field: string]: string
}

const labels: Labels = { max_completion_tokens: 'max_output' }

/** A compact field label: the price label, a curated alias, or the field's last path segment. */
export function fieldLabel(field: string): string {
  return priceFields[field]?.label ?? labels[field] ?? field.split('.').at(-1) ?? field
}

/** The unit a quoted price is shown per, such as MTOK. */
export const priceUnit = (field: string): string | undefined => priceFields[field]?.unit

/** A lifecycle fact by Contract field, when it holds the kind the caller presents. */
export function findFact<K extends AlertKind>(
  facts: readonly AlertFact[],
  field: string,
  kind: K,
): Extract<AlertFact, { kind: K }> | undefined {
  return facts.find(
    (item): item is Extract<AlertFact, { kind: K }> => item.field === field && item.kind === kind,
  )
}

/** A count, discount, or price fact. */
export type Quantity = Extract<AlertFact, { kind: 'count' | 'percent' | 'price' }>

export const isQuantity = (item: AlertFact): item is Quantity =>
  item.kind === 'count' || item.kind === 'percent' || item.kind === 'price'

/** Quantities read the same in every product: grouped counts, percent discounts, and scaled prices. */
export function formatQuantity(item: Quantity): string {
  if (item.value === null) {
    return 'null'
  }

  if (item.kind === 'count') {
    return formatNumber(item.value) ?? String(item.value)
  }

  if (item.kind === 'percent') {
    return formatPercent(item.value) ?? String(item.value)
  }

  const field = priceFields[item.field]

  return (field === undefined ? null : formatPrice(item.value, field.scale)) ?? `$${item.value}`
}

const blockTextLength = { pair: 30, single: 80 }

/**
 * Prose, and text too long for one row, such as URLs, take a block layout.
 * A before/after pair shares its row, so it switches sooner than a lone added or removed value.
 */
export function isBlockText(item: AlertFact, layout: 'pair' | 'single'): boolean {
  return (
    item.kind === 'prose' ||
    (item.kind === 'text' && (item.value?.length ?? 0) > blockTextLength[layout])
  )
}

/** A quantity's relative movement; lower prices and higher limits are favorable. */
export type Movement = { isUp: boolean; isFavorable: boolean; percent: string }

/** One change, classified once so every product presents the same cases. */
export type PresentedChange =
  /** An opaque field changed; its values are never presented. */
  | { transition: 'opaque'; field: string }
  | { transition: 'members'; field: string; added: string[]; removed: string[] }
  | { transition: 'added'; field: string; fact: AlertFact }
  | { transition: 'removed'; field: string; fact: AlertFact }
  | {
      transition: 'updated'
      field: string
      before: AlertFact
      after: AlertFact
      /** Only counts and prices move; discounts are fractions whose movement is not a delta. */
      movement: Movement | null
    }

/** `fractionDigits` sets movement precision; products choose their own density. */
export function presentChange(
  change: AlertChange,
  { fractionDigits }: { fractionDigits?: number } = {},
): PresentedChange {
  const { field } = change

  if (change.kind === 'opaque') {
    return { field, transition: 'opaque' }
  }

  if (change.kind === 'list') {
    return { added: change.added, field, removed: change.removed, transition: 'members' }
  }

  const { before, after } = sides(change)

  if (before.value === null) {
    return { fact: after, field, transition: 'added' }
  }

  if (after.value === null) {
    return { fact: before, field, transition: 'removed' }
  }

  return { after, before, field, movement: movement(change, fractionDigits), transition: 'updated' }
}

function sides<K extends ValueKind>(change: ValueChange<K>) {
  const side = (value: KindValues[K]): AlertFact<K> => ({
    field: change.field,
    kind: change.kind,
    value,
  })

  return { after: side(change.after), before: side(change.before) }
}

function movement(change: ValueChange, fractionDigits: number | undefined): Movement | null {
  if (change.kind !== 'count' && change.kind !== 'price') {
    return null
  }

  const { before, after } = change

  const relative =
    before === null || after === null ? null : relativeChange(before, after, { fractionDigits })

  return relative === null
    ? null
    : { ...relative, isFavorable: change.kind === 'price' ? !relative.isUp : relative.isUp }
}
