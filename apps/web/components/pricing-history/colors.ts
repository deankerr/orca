const MIN_LIGHTNESS = 0.66
const LIGHTNESS_RANGE = 0.1
const CHROMA_FRACTION = 0.85
const MAX_CHROMA = 0.4
const SEARCH_STEPS = 16

// olive hues read as murky at chart lightness, so the hue wheel
// skips this band entirely. Everything else stays reachable.
const MUD_BAND_START = 100
const MUD_BAND_END = 120

/** Return the browser-facing OKLCH color for a provider's chart line and legend controls. */
export function providerColor(providerId: string) {
  const { lightness, chroma, hue } = providerColorCoordinates(providerId)

  return `oklch(${formatChannel(lightness)} ${formatChannel(chroma)} ${formatChannel(hue)})`
}

/** Return the same color in sRGB because ECharts cannot parse OKLCH. */
export function providerSrgbColor(providerId: string) {
  const { lightness, chroma, hue } = providerColorCoordinates(providerId)
  const [red, green, blue] = linearSrgbChannels(lightness, chroma, hue).map(linearToSrgbByte)

  return `rgb(${red}, ${green}, ${blue})`
}

/* oxlint-disable no-bitwise, unicorn/prefer-math-trunc -- FNV-1a hashing is inherently 32-bit integer math. */
/** 32-bit FNV-1a: cheap, stable, and well-mixed for short slugs. */
function fnv1aHash(text: string) {
  let hash = 0x81_1c_9d_c5

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.codePointAt(index) ?? 0
    hash = Math.imul(hash, 0x01_00_01_93)
  }

  return hash >>> 0
}

function providerColorCoordinates(providerId: string) {
  const hash = fnv1aHash(providerId)

  // Colors derive purely from the provider id: adding or hiding providers can
  // never reshuffle the palette. Low bits pick the hue, high bits nudge the
  // lightness so near-hue collisions still separate a little.
  const hueFraction = (hash & 0xff_ff) / 0x1_00_00
  const lightnessFraction = (hash >>> 16) / 0x1_00_00
  /* oxlint-enable no-bitwise, unicorn/prefer-math-trunc */

  const usableHueRange = 360 - (MUD_BAND_END - MUD_BAND_START)
  const hue = (MUD_BAND_END + hueFraction * usableHueRange) % 360
  const lightness = MIN_LIGHTNESS + lightnessFraction * LIGHTNESS_RANGE
  const chroma = findMaxSrgbChroma(lightness, hue) * CHROMA_FRACTION

  return { lightness, chroma, hue }
}

function linearSrgbChannels(lightness: number, chroma: number, hue: number) {
  // Convert OKLCH through OKLab and LMS into linear sRGB. Keeping this local
  // lets palette generation test gamut before the browser clamps any channel.
  const hueRadians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(hueRadians)
  const b = chroma * Math.sin(hueRadians)

  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const
}

function isInSrgbGamut(lightness: number, chroma: number, hue: number) {
  return linearSrgbChannels(lightness, chroma, hue).every((channel) => channel >= 0 && channel <= 1)
}

function findMaxSrgbChroma(lightness: number, hue: number) {
  let lower = 0
  let upper = MAX_CHROMA

  // Available sRGB chroma varies sharply by hue. A bounded binary search gives
  // each color comparable vividness without shifting its intended hue.
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const candidate = (lower + upper) / 2
    if (isInSrgbGamut(lightness, candidate, hue)) {
      lower = candidate
    } else {
      upper = candidate
    }
  }

  return lower
}

function formatChannel(value: number) {
  return Number(value.toFixed(3)).toString()
}

function linearToSrgbByte(channel: number) {
  const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}
