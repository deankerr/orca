import { z } from 'zod'

/** The price keys a condition restates; a key absent here keeps the endpoint's base rate. */
export type PriceRates = Record<string, string>

/** Applies above a prompt size; upstream's threshold is exclusive. */
export interface PriceBracket {
  above_prompt_tokens: number
  rates: PriceRates
}

/**
 * When a band applies, in UTC. Clocks are HHMM numbers forming `[start, end)`, wrapping past midnight
 * when `end` is not after `start`. Null clocks mean the whole day; null `days` means every day.
 */
export interface PriceWindow {
  days: string[] | null
  end: number | null
  start: number | null
}

/** One distinct set of scheduled rates, with every window that charges them. */
export interface PriceBand {
  rates: PriceRates
  windows: PriceWindow[]
}

/**
 * What an endpoint's overrides say, for presenting beside the rates upstream reports.
 *
 * This describes conditions and never chooses a price: reported meters already follow the active
 * band, and discount is not applied here. Rows this cannot read stay in `unrecognized` as sent.
 */
export interface ConditionalPricing<Row extends object = object> {
  bands: PriceBand[]
  brackets: PriceBracket[]
  unrecognized: Row[]
}

const Rate = z.string().regex(/^\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/u)
const Days = z.array(z.string()).min(1)

// A key that is neither a known condition nor a rate fails, so a new condition stays unrecognized.
const BracketRow = z
  .object({ min_prompt_tokens: z.number() })
  .catchall(Rate)
  .transform(({ min_prompt_tokens: above, ...rates }) => ({ above, rates }))

const ClockRow = z
  .object({ utc_days: Days.optional(), utc_end: z.number(), utc_start: z.number() })
  .catchall(Rate)
  .transform(({ utc_days: days = null, utc_end: end, utc_start: start, ...rates }) => ({
    rates,
    window: { days, end, start },
  }))

const DayRow = z
  .object({ utc_days: Days })
  .catchall(Rate)
  .transform(({ utc_days: days, ...rates }) => ({
    rates,
    window: { days, end: null, start: null },
  }))

const ScheduleRow = z.union([ClockRow, DayRow])

/** Any `utc_*` key marks a schedule, including rows `conditionalPricing` cannot read. */
export const isSchedulePriced = (rows: readonly object[] | null | undefined) =>
  rows?.some((row) => Object.keys(row).some((key) => key.startsWith('utc'))) ?? false

/** A `min_prompt_tokens` key marks long-context pricing, whether or not the row can be read. */
export const isLongContextPriced = (rows: readonly object[] | null | undefined) =>
  rows?.some((row) => 'min_prompt_tokens' in row) ?? false

/** Later rows win per key among rows that apply, and every lower threshold also applies. */
function resolveBrackets(rows: { above: number; rates: PriceRates }[]): PriceBracket[] {
  const thresholds = [...new Set(rows.map(({ above }) => above))].toSorted((a, b) => a - b)

  return thresholds.map((threshold) => ({
    above_prompt_tokens: threshold,
    rates: Object.fromEntries(
      rows.flatMap(({ above, rates }) => (above <= threshold ? Object.entries(rates) : [])),
    ),
  }))
}

const ratesKey = (rates: PriceRates) =>
  JSON.stringify(Object.entries(rates).toSorted(([a], [b]) => a.localeCompare(b)))

/** Read overrides by upstream's documented rules, without rejecting anything it sends. */
export function conditionalPricing<Row extends object>(
  rows: readonly Row[],
): ConditionalPricing<Row> {
  const bands = new Map<string, PriceBand>()
  const brackets: { above: number; rates: PriceRates }[] = []
  const unrecognized: Row[] = []

  for (const row of rows) {
    const bracket = BracketRow.safeParse(row)
    const scheduled = ScheduleRow.safeParse(row)

    if (bracket.success) {
      brackets.push(bracket.data)
    } else if (scheduled.success) {
      const { rates, window } = scheduled.data
      const key = ratesKey(rates)
      const band = bands.get(key) ?? { rates, windows: [] }

      band.windows.push(window)
      bands.set(key, band)
    } else {
      unrecognized.push(row)
    }
  }

  return { bands: [...bands.values()], brackets: resolveBrackets(brackets), unrecognized }
}
