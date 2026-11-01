import { conditionalPricing } from '@orca/pricing'
import type { PriceBand, PriceBracket, PriceRates, PriceWindow } from '@orca/pricing'
import * as R from 'remeda'
import type { z } from 'zod'

import type { Pricing } from '../../../catalog/pricing'
import type { AlertChange } from './curate'
import { formatQuantity } from './present'
import { rateMoved } from './pricing'

interface RateNames {
  [key: string]: { field: string; label: string }
}

/** Contract fields and labels for upstream rate keys, in display order. */
// oxlint-disable sort-keys -- Key order is the rate display order.
const rateNames: RateNames = {
  prompt: { field: 'pricing.input', label: 'Input' },
  completion: { field: 'pricing.output', label: 'Output' },
  input_cache_read: { field: 'pricing.input_cache_read', label: 'Cache read' },
  input_cache_write: { field: 'pricing.input_cache_write', label: 'Cache write' },
  input_cache_write_1h: { field: 'pricing.input_cache_write_1h', label: 'Cache write 1h' },
  audio: { field: 'pricing.audio', label: 'Audio' },
  audio_output: { field: 'pricing.audio_output', label: 'Audio output' },
  input_audio_cache: { field: 'pricing.input_audio_cache', label: 'Audio cache' },
  image: { field: 'pricing.image', label: 'Image' },
  image_output: { field: 'pricing.image_output', label: 'Image output' },
  web_search: { field: 'pricing.web_search', label: 'Web search' },
}
// oxlint-enable sort-keys

const displayOrder = Object.keys(rateNames)

function rank(key: string): number {
  const index = displayOrder.indexOf(key)

  return index === -1 ? displayOrder.length : index
}

const rateLabel = (key: string) => rateNames[key]?.label ?? key

const rate = (key: string, value: string) =>
  formatQuantity({ field: rateNames[key]?.field ?? key, kind: 'price', value })

const rateList = (rates: PriceRates) =>
  Object.keys(rates)
    .toSorted((a, b) => rank(a) - rank(b))
    .flatMap((key) => {
      const value = rates[key]

      return value === undefined ? [] : [`${rateLabel(key)} ${rate(key, value)}`]
    })

/** Rates that moved within one condition; movements under the alert threshold are not announced. */
function rateChanges(before: PriceRates, after: PriceRates): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .toSorted((a, b) => rank(a) - rank(b))
    .flatMap((key) => {
      const [from, to] = [before[key], after[key]]

      if (from === undefined) {
        return to === undefined ? [] : [`${rateLabel(key)} ${rate(key, to)} added`]
      }

      if (to === undefined) {
        return [`${rateLabel(key)} ${rate(key, from)} removed`]
      }

      return rateMoved(from, to) ? [`${rateLabel(key)} ${rate(key, from)} → ${rate(key, to)}`] : []
    })
}

const clock = (time: number) =>
  `${String(Math.floor(time / 100)).padStart(2, '0')}:${String(time % 100).padStart(2, '0')}`

const week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const dayLabel = (day: string) => day.slice(0, 1).toUpperCase() + day.slice(1, 3)

const daysLabel = (days: string[] | null) =>
  days
    ?.toSorted((a, b) => week.indexOf(a) - week.indexOf(b) || a.localeCompare(b))
    .map(dayLabel)
    .join(', ') ?? ''

const hoursLabel = ({ end, start }: PriceWindow) =>
  start === null || end === null ? [] : [`${clock(start)}–${clock(end)}`]

const bracketLabel = ({ above_prompt_tokens: above }: PriceBracket) =>
  `Above ${above.toLocaleString('en-US')} tokens`

/** Windows sharing their days share a clause, such as `Sat, Sun` or `Mon, Tue 01:00–04:00, 06:00–10:00`. */
function bandLabel({ windows }: PriceBand): string {
  const clauses = R.groupBy(windows, ({ days }) => daysLabel(days))

  const label = Object.entries(clauses)
    .map(([days, group]) =>
      [days, group.flatMap(hoursLabel).toSorted().join(', ')].filter(Boolean).join(' '),
    )
    .toSorted()
    .join('; ')

  return `${label} UTC`
}

/** Conditions by what they say, so row order and repeated rates are not changes. */
function conditions(pricing: z.infer<typeof Pricing>) {
  const { bands, brackets, unrecognized } = conditionalPricing(pricing.overrides ?? [])

  return {
    rates: new Map<string, PriceRates>([
      ...brackets.map((bracket): [string, PriceRates] => [bracketLabel(bracket), bracket.rates]),
      ...bands.map((band): [string, PriceRates] => [bandLabel(band), band.rates]),
    ]),
    readable: unrecognized.length === 0,
  }
}

const presence = (label: string, rates: PriceRates, transition: 'added' | 'removed') =>
  [`${label} ${transition}`, rateList(rates).join(', ')].filter(Boolean).join(': ')

/**
 * What changed between two quotes' conditions, or null when nothing worth announcing did.
 *
 * Rows that cannot be read stay an opaque change: an upstream shape ORCA does not know is reported
 * as changed rather than interpreted or hidden.
 */
export function conditionChange(
  quoteBefore: z.infer<typeof Pricing>,
  quoteAfter: z.infer<typeof Pricing>,
): AlertChange | null {
  const [before, after] = [conditions(quoteBefore), conditions(quoteAfter)]

  if (!before.readable || !after.readable) {
    return { field: 'pricing.overrides', kind: 'opaque' }
  }

  const lines = [...new Set([...before.rates.keys(), ...after.rates.keys()])].flatMap((label) => {
    const [from, to] = [before.rates.get(label), after.rates.get(label)]

    if (from === undefined) {
      return to === undefined ? [] : [presence(label, to, 'added')]
    }

    if (to === undefined) {
      return [presence(label, from, 'removed')]
    }

    const moved = rateChanges(from, to)

    return moved.length === 0 ? [] : [`${label}: ${moved.join(', ')}`]
  })

  return lines.length === 0 ? null : { field: 'pricing.overrides', kind: 'conditions', lines }
}
