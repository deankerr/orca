type Numeric = number | string

type Precision = {
  minimumFractionDigits?: number
  fractionDigits?: number
  significantDigits?: number
}

type Ratio = { numerator: bigint; denominator: bigint }

/** Compare original decimal values, including tiny values that Number would underflow to zero. */
export function compareNumbers(left: Numeric, right: Numeric): -1 | 0 | 1 | null {
  const a = decimal(left)
  const b = decimal(right)

  if (a === null || b === null) {
    return null
  }

  const difference = a.numerator * b.denominator - b.numerator * a.denominator

  return difference === 0n ? 0 : difference > 0n ? 1 : -1
}

/**
 * Keep integer counts intact and give fractions three significant digits by default.
 * 0.000396 stays 0.000396; 0.016156 becomes 0.0162; 128001 stays 128,001.
 * Fraction digits are a baseline, not a cap that could erase a small nonzero value.
 * Decimal strings never pass through Number: 0.004455 must round to 0.00446,
 * and distinct prices can differ beyond the precision of a JavaScript number.
 */
export function formatNumber(
  value: Numeric,
  { scale = 0, ...precision }: Precision & { scale?: number } = {},
): string | null {
  const ratio = decimal(value, scale)

  return ratio === null ? null : formatRatio(ratio, precision)
}

/** Money keeps cents for familiar prices ($1.40), without turning $0.000198 into $0.00. */
export function formatPrice(value: Numeric, scale = 0): string | null {
  const amount = formatNumber(value, { scale, minimumFractionDigits: 2 })

  return amount === null ? null : `$${amount}`
}

/** An absolute percentage, such as a discount, is independent of a relative change. */
export function formatPercent(value: Numeric): string | null {
  const amount = formatNumber(value, { scale: 2, fractionDigits: 1 })

  return amount === null ? null : `${amount}%`
}

/**
 * Compute from original values, never from their rounded display strings.
 * 0.141953 → 0.142 is +0.033%, not 0%; an even smaller change is <0.001%.
 * The same rule serves prices, discounts, limits, and any other numeric field.
 * A zero baseline has no relative percentage; negative baselines use their magnitude.
 * Consumers may request fixed decimal places; changes rounding to zero keep only their direction.
 */
export function relativeChange(
  before: Numeric,
  after: Numeric,
  { fractionDigits }: { fractionDigits?: number } = {},
): { isUp: boolean; percent: string } | null {
  const ratio = relativeDifference(before, after)

  if (ratio === null) {
    return null
  }

  const amount =
    fractionDigits === undefined
      ? ratio.numerator * 1000n < ratio.denominator
        ? '<0.001'
        : formatRatio(ratio, { fractionDigits: 1, significantDigits: 2 })
      : formatRatio(ratio, { fractionDigits, significantDigits: 0 })

  return { isUp: ratio.isUp, percent: amount === '0' ? '' : `${amount}%` }
}

/** Threshold decisions use exact ratios, independently of any renderer's precision. */
export function relativeChangeAtLeast(
  before: Numeric,
  after: Numeric,
  minimumPercent: number,
): boolean {
  const minimum = decimal(minimumPercent)

  if (minimum === null || minimum.numerator < 0n) {
    throw new RangeError('minimumPercent must be a finite nonnegative number')
  }

  const ratio = relativeDifference(before, after)

  return (
    ratio !== null && ratio.numerator * minimum.denominator >= ratio.denominator * minimum.numerator
  )
}

function relativeDifference(before: Numeric, after: Numeric): (Ratio & { isUp: boolean }) | null {
  const old = decimal(before)
  const next = decimal(after)

  if (old === null || next === null || old.numerator === 0n) {
    return null
  }

  const difference = next.numerator * old.denominator - old.numerator * next.denominator

  if (difference === 0n) {
    return null
  }

  return {
    isUp: difference > 0n,
    numerator: abs(difference) * 100n,
    denominator: abs(old.numerator) * next.denominator,
  }
}

const abs = (value: bigint): bigint => (value < 0n ? -value : value)
const power = (places: number): bigint => 10n ** BigInt(places)

/** Bound untrusted representations before allocating powers; include numeric exponent notation. */
function decimal(value: Numeric, scale = 0): Ratio | null {
  const text = String(value)

  if (text.length > 100 || !Number.isInteger(scale) || Math.abs(scale) > 1000) {
    return null
  }

  const parts =
    /^(?<sign>[+-]?)(?<whole>\d+)(?:\.(?<fraction>\d+))?(?:[eE](?<exponent>[+-]?\d+))?$/.exec(
      text,
    )?.groups

  if (parts === undefined) {
    return null
  }

  const fraction = parts.fraction ?? ''
  const exponent = Number(parts.exponent ?? 0) - fraction.length + scale

  if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) {
    return null
  }

  const coefficient = BigInt(`${parts.sign}${parts.whole}${fraction}`)

  return {
    numerator: coefficient * power(Math.max(0, exponent)),
    denominator: power(Math.max(0, -exponent)),
  }
}

function formatRatio(
  { numerator, denominator }: Ratio,
  {
    minimumFractionDigits = 0,
    fractionDigits = minimumFractionDigits,
    significantDigits = 3,
  }: Precision,
): string {
  const magnitude = abs(numerator)
  let order = magnitude.toString().length - denominator.toString().length

  if (
    order >= 0 ? magnitude < denominator * power(order) : magnitude * power(-order) < denominator
  ) {
    order -= 1
  }

  const places = Math.max(
    minimumFractionDigits,
    fractionDigits,
    magnitude === 0n || significantDigits === 0 ? 0 : significantDigits - 1 - order,
  )

  // Round half away from zero once, using integer arithmetic even at decimal ties.
  const rounded = (magnitude * power(places) * 2n + denominator) / (denominator * 2n)
  const digits = rounded.toString().padStart(places + 1, '0')
  const whole = places === 0 ? digits : digits.slice(0, -places)
  const fraction = (places === 0 ? '' : digits.slice(-places))
    .replace(/0+$/, '')
    .padEnd(minimumFractionDigits, '0')

  return `${numerator < 0n && rounded !== 0n ? '-' : ''}${BigInt(whole).toLocaleString('en-US')}${fraction === '' ? '' : `.${fraction}`}`
}
