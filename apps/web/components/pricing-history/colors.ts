const LIGHTNESS = 0.7
const CURATED_CHROMA_FRACTION = 0.9
const GENERATED_CHROMA_FRACTION = 0.8
const BASE_HUE = 25
const MAX_CHROMA = 0.4
const SEARCH_STEPS = 16

/** Ordered for maximum separation in the small endpoint sets used by most models. */
const CURATED_HUES = [250, 25, 145, 305, 85, 195, 350, 115, 275, 55] as const

/** Return the browser-facing OKLCH color used by endpoint controls. */
export function endpointColor(index: number, endpointCount: number) {
  const { lightness, chroma, hue } = endpointColorCoordinates(index, endpointCount)

  return `oklch(${formatChannel(lightness)} ${formatChannel(chroma)} ${formatChannel(hue)})`
}

/** Return the same palette in sRGB because ECharts cannot parse OKLCH. */
export function endpointSrgbColor(index: number, endpointCount: number) {
  const { lightness, chroma, hue } = endpointColorCoordinates(index, endpointCount)
  const [red, green, blue] = linearSrgbChannels(lightness, chroma, hue).map(linearToSrgbByte)

  return `rgb(${red}, ${green}, ${blue})`
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right

  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }

  return a
}

/** Pick a coprime step so neighboring legend entries are far apart in hue. */
function distributedStep(count: number) {
  if (count <= 2) {
    return 1
  }

  let step = Math.max(1, Math.round(count * 0.382))
  while (step < count && greatestCommonDivisor(step, count) !== 1) {
    step += 1
  }

  return step === count ? 1 : step
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

function endpointColorCoordinates(index: number, endpointCount: number) {
  const count = Math.max(1, endpointCount)
  const usesCuratedPalette = count <= CURATED_HUES.length
  // Large palettes walk a count-specific coprime permutation of the hue wheel;
  // adjacent endpoint IDs therefore remain separated instead of clustering.
  const paletteIndex = (index * distributedStep(count)) % count
  const hue = usesCuratedPalette
    ? (CURATED_HUES[index] ?? CURATED_HUES[0])
    : (BASE_HUE + (paletteIndex * 360) / count) % 360
  const chromaFraction = usesCuratedPalette ? CURATED_CHROMA_FRACTION : GENERATED_CHROMA_FRACTION
  const chroma = findMaxSrgbChroma(LIGHTNESS, hue) * chromaFraction

  return { lightness: LIGHTNESS, chroma, hue }
}

function linearToSrgbByte(channel: number) {
  const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}
