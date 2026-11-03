import { compareNumbers, formatPercent, formatPrice } from '@orca/backend/numbers'
import type { Endpoint } from '@orca/contract/endpoint'
import { conditionalPricing, priceMeters } from '@orca/pricing'
import type { PriceBand, PriceBracket, PriceRates, PriceWindow } from '@orca/pricing'

import { formatContext } from '#features/table/format'

import type { FactRow } from './rows'

type Pricing = Endpoint['pricing']

type Meter = keyof typeof priceMeters

/** How each meter appears: its label, the Contract field holding its rate, and a short hover text. */
type RateField = Exclude<keyof Pricing, 'discount' | 'overrides'>

const meters: Record<Meter, { description?: string; field: RateField; label: string }> = {
  audio: { field: 'audio', label: 'Audio' },
  audio_output: { field: 'audio_output', label: 'Audio output' },
  completion: { field: 'output', label: 'Output' },
  image: {
    description: 'Image input is priced per token, not per image.',
    field: 'image',
    label: 'Image',
  },
  image_output: { field: 'image_output', label: 'Image output' },
  input_audio_cache: { field: 'input_audio_cache', label: 'Audio cache' },
  input_cache_read: { field: 'input_cache_read', label: 'Cache read' },
  input_cache_write: { field: 'input_cache_write', label: 'Cache write' },
  input_cache_write_1h: { field: 'input_cache_write_1h', label: 'Cache write 1h' },
  prompt: { field: 'input', label: 'Input' },
  web_search: {
    description: 'Charged per web search request; the discount does not apply.',
    field: 'web_search',
    label: 'Web search',
  },
}

const isMeter = (key: string): key is Meter => Object.hasOwn(priceMeters, key)

/**
 * One meter's rate as the panel shows it: $/M tokens, or per request for web search. Zero is a real
 * price of `$0`. Null when the rate is not a decimal.
 */
export function formatMeterRate(rate: string, meter: Meter): string | null {
  const { scale } = priceMeters[meter]
  const amount = compareNumbers(rate, 0) === 0 ? '$0' : formatPrice(rate, scale)

  if (amount === null) {
    return null
  }

  return meter === 'web_search' ? `${amount} /req` : amount
}

/** Meter keys of a conditional rate set, in the display order of `priceMeters`. */
function orderedKeys(rates: PriceRates): string[] {
  const order = Object.keys(priceMeters)

  return Object.keys(rates).toSorted((a, b) => {
    const [first, second] = [order.indexOf(a), order.indexOf(b)]

    return (first === -1 ? order.length : first) - (second === -1 ? order.length : second)
  })
}

const rateText = (rates: PriceRates, key: string) => {
  const raw = rates[key] ?? ''

  return isMeter(key) ? (formatMeterRate(raw, key) ?? raw) : raw
}

const meterName = (key: string) => (isMeter(key) ? meters[key].label.toLowerCase() : key)

const restatesInputAndOutput = (rates: PriceRates) => 'prompt' in rates && 'completion' in rates

/**
 * The headline of a conditional rate set: `$0.50 / $2.50` when it restates input and output, else
 * each meter named so a lone cache rate is not mistaken for an input price.
 */
export function formatOverrideRates(rates: PriceRates): string {
  if (restatesInputAndOutput(rates)) {
    return `${rateText(rates, 'prompt')} / ${rateText(rates, 'completion')}`
  }

  return orderedKeys(rates)
    .map((key) => `${meterName(key)} ${rateText(rates, key)}`)
    .join(' / ')
}

const ratesDescription = (rates: PriceRates) => orderedKeys(rates).map(meterName).join(' / ')

/** A condition's headline row, then one indented row for each further meter it restates. */
function overrideRows(
  row: Pick<FactRow, 'description' | 'id' | 'label'>,
  rates: PriceRates,
): FactRow[] {
  const headline: FactRow = { ...row, emphasis: true, value: formatOverrideRates(rates) }

  if (!restatesInputAndOutput(rates)) {
    return [headline]
  }

  const further = orderedKeys(rates)
    .filter((key) => key !== 'prompt' && key !== 'completion')
    .map((key): FactRow => ({
      id: `${row.id}-${key}`,
      indent: true,
      label: meterName(key),
      value: rateText(rates, key),
    }))

  return [headline, ...further]
}

function bracketRows({ above_prompt_tokens: above, rates }: PriceBracket): FactRow[] {
  return overrideRows(
    {
      description: `Rates for prompts above ${above.toLocaleString('en')} tokens, in $/M tokens: ${ratesDescription(rates)}.`,
      id: `over-${above}`,
      label: `Over ${formatContext(above)} prompt tokens`,
    },
    rates,
  )
}

const clock = (time: number) => {
  const text = String(time).padStart(4, '0')

  return `${text.slice(0, 2)}:${text.slice(2)}`
}

function windowText({ days, end, start }: PriceWindow): string {
  const hours = start === null || end === null ? 'all day' : `${clock(start)}–${clock(end)}`
  const dayNames = days === null ? null : days.map((day) => day.slice(0, 3)).join(' ')

  return [dayNames, hours, 'UTC'].filter((part) => part !== null).join(' ')
}

function bandRows({ rates, windows }: PriceBand, index: number): FactRow[] {
  return overrideRows(
    {
      description: `Scheduled rates, in $/M tokens: ${ratesDescription(rates)}. The rates reported above already follow the schedule.`,
      id: `schedule-${index}`,
      label: windows.map(windowText).join(', '),
    },
    rates,
  )
}

/**
 * Pricing rows: each meter the endpoint quotes, a positive discount, then its conditional prices as
 * extra detail. Rates already reflect the discount, and override rates take none.
 */
export function pricingRows(pricing: Pricing): FactRow[] {
  const rows: FactRow[] = []

  for (const key of Object.keys(priceMeters)) {
    if (!isMeter(key)) {
      continue
    }

    const { description, field, label } = meters[key]
    const rate = pricing[field]

    if (rate !== null) {
      const row: FactRow = { id: key, label, value: formatMeterRate(rate, key) ?? rate }

      if (description !== undefined) {
        row.description = description
      }

      rows.push(row)
    }
  }

  if (pricing.discount > 0) {
    rows.push({
      description: 'Already reflected in the rates above.',
      id: 'discount',
      label: 'Discount',
      value: `${formatPercent(pricing.discount) ?? pricing.discount} off`,
    })
  }

  const { bands, brackets, unrecognized } = conditionalPricing(pricing.overrides ?? [])

  rows.push(...brackets.flatMap(bracketRows), ...bands.flatMap(bandRows))

  if (unrecognized.length > 0) {
    rows.push({
      description: 'Conditional pricing ORCA does not read yet.',
      id: 'unrecognized',
      label: 'Other conditions',
      value: `${unrecognized.length} unread`,
    })
  }

  return rows
}
