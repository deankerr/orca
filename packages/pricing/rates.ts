/** A meter rate decimal string, such as `0.0000025` or `2.5E-6`. */
const RATE = /^(?<mantissa>\d+(?:\.\d+)?)(?:[Ee](?<exponent>[+-]?\d+))?$/u

/** Mantissa and exponent of a present, nonzero rate. */
function nonzero(rate: string | null) {
  const groups = rate === null ? undefined : RATE.exec(rate)?.groups

  return groups?.mantissa === undefined || !/[1-9]/u.test(groups.mantissa)
    ? null
    : { exponent: Number(groups.exponent ?? 0), mantissa: groups.mantissa }
}

/**
 * A quoted rate: present and nonzero. Grids treat a zero rate as absent, because it does not state a
 * price anyone pays. Change alerts and Pricing History keep zero as a fact.
 */
export function quotedRate(rate: string | null): string | null {
  return nonzero(rate) === null ? null : rate
}

/**
 * A quoted per-token rate in USD per million tokens, for sorting, filtering, and plotting; display
 * formats the original string instead. Shifting the exponent before parsing keeps `0.0000025` at
 * exactly 2.5. Null when the rate is absent, zero, or not a finite positive number of dollars per
 * million, such as `1e-330`, which underflows to 0, or `1e309`, which overflows to Infinity.
 */
export function perMillion(rate: string | null): number | null {
  const parts = nonzero(rate)

  if (parts === null) {
    return null
  }

  const value = Number(`${parts.mantissa}e${parts.exponent + 6}`)

  return Number.isFinite(value) && value > 0 ? value : null
}

/** Share of the blended price from input: three parts input to one part output. */
const BLEND_INPUT_WEIGHT = 0.75

/**
 * Blended price: three parts input to one part output, `0.75 × input + 0.25 × output`, in the rates'
 * unit. Weighting before adding keeps two huge finite rates finite. Null when either rate is absent.
 */
export function blendedPrice(input: number | null, output: number | null): number | null {
  return input === null || output === null
    ? null
    : BLEND_INPUT_WEIGHT * input + (1 - BLEND_INPUT_WEIGHT) * output
}
