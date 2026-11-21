/** How an agent or application spends tokens: the shape of its input and how much of it a cache serves. */
export interface Workload {
  /** Input tokens per output token; above zero. */
  ratio: number
  /** Share of input tokens billed at the cache-read rate, 0 to 1. The rest are fresh input. */
  hitRate: number
}

/** The rates a workload cost reads, in $/M tokens. Null is absent; an `EndpointRow` fits as it is. */
export interface WorkloadRates {
  input: number | null
  output: number | null
  cacheRead: number | null
  /** The 5-minute cache-write rate; the 1-hour rate is not read. */
  cacheWrite: number | null
}

/** A named workload. */
export interface WorkloadPreset {
  id: string
  label: string
  workload: Workload
}

/**
 * Named workloads, each resting on a published source (read 2026-11-22; see `docs/orca/pricing.md`).
 * A preset is only a named pair: a workload is active as a preset when it equals one.
 */
export const workloadPresets = [
  {
    id: 'agentic',
    label: 'Agentic',
    // OpenRouter Inferred 03 (2026-10-08), agentic keys, 2026-09: 87% cached, 12% novel prompt, 1% output
    // is 99:1 at 88%, rounded.
    workload: { hitRate: 0.9, ratio: 100 },
  },
  {
    id: 'chat',
    label: 'Chat',
    // OpenRouter Inferred 03, human keys: output and reasoning are about 12% of tokens, so 88/12 is 7:1.
    // The cached share is unpublished (under 50%); 0 is our choice, the uncached price.
    workload: { hitRate: 0, ratio: 7 },
  },
  {
    id: 'aa',
    label: 'AA blend',
    // Artificial Analysis methodology: a 7:2:1 ratio of cache hit, input, and output tokens, so 9:1 with
    // 7/9 read from cache, rounded to a whole percent. A convention, not a measurement.
    workload: { hitRate: 0.78, ratio: 9 },
  },
] as const satisfies readonly WorkloadPreset[]

/** The workload views start from: the `agentic` preset. */
export const defaultWorkload: Workload = workloadPresets[0].workload

/** The preset a workload equals, or undefined when its numbers match none. */
export function matchingPreset(workload: Workload): WorkloadPreset | undefined {
  return workloadPresets.find(
    (preset) =>
      preset.workload.ratio === workload.ratio && preset.workload.hitRate === workload.hitRate,
  )
}

/**
 * Whether the endpoint's lack of a cache raises its workload cost: it has no cache-read rate, the
 * workload uses a cache (hit rate above 0), and the cost is above 0. Without a cache every input token
 * pays the input rate, so a cache would only have lowered the cost. A hit rate of 0 means no endpoint
 * uses one, and a free endpoint costs 0 either way, so neither is marked. An absent read rate means
 * no cache, whatever the write rate; an absent cost is not raised by anything.
 */
export function isCostRaisedByNoCache(rates: WorkloadRates, workload: Workload): boolean {
  const cost = workloadCost(rates, workload)

  return rates.cacheRead === null && workload.hitRate > 0 && cost !== null && cost > 0
}

/**
 * The terms of the average input-token price, each already multiplied by its share of input tokens, in
 * $/M. Cache reads pay the read rate, the rest are fresh. Without a cache, or at a hit rate of 0, which
 * means the workload does not use one, every token pays the input rate.
 *
 * Fresh tokens pay no write rate without one; a write rate at or above input replaces the input rate
 * (Anthropic, OpenAI); one below input is a surcharge on top of it (Gemini's storage charge; xAI quotes
 * $0), which is two terms. At a hit rate of 1 no token is fresh, so the fresh rate is not read at all.
 * The shares are applied to each rate separately, so no sum of two rates exists before they shrink.
 */
function inputTerms(
  input: number,
  cacheRead: number | null,
  cacheWrite: number | null,
  hitRate: number,
): number[] {
  if (cacheRead === null || hitRate === 0) {
    return [input]
  }

  const read = hitRate * cacheRead

  if (hitRate === 1) {
    return [read]
  }

  const fresh = 1 - hitRate

  if (cacheWrite === null) {
    return [read, fresh * input]
  }

  return cacheWrite >= input
    ? [read, fresh * cacheWrite]
    : [read, fresh * input, fresh * cacheWrite]
}

/**
 * Workload cost in $/M tokens: `(ratio × inputCost + output) / (ratio + 1)`, where `inputCost` is the
 * average price of an input token under the workload's hit rate, which is the input rate at a hit rate
 * of 0 (see `docs/orca/pricing.md`). Every share (the ratio's and the hit rate's) is applied to each
 * rate before any are added, so rates whose true cost is representable never overflow on the way.
 * A free endpoint costs 0; null when input or output is absent, or when the cost is too large for a
 * double, as `perMillion` treats an unrepresentable rate.
 */
export function workloadCost(rates: WorkloadRates, workload: Workload): number | null {
  const { cacheRead, cacheWrite, input, output } = rates

  if (input === null || output === null) {
    return null
  }

  const inputWeight = workload.ratio / (workload.ratio + 1)
  const outputWeight = 1 / (workload.ratio + 1)

  const cost =
    inputTerms(input, cacheRead, cacheWrite, workload.hitRate).reduce(
      (sum, term) => sum + inputWeight * term,
      0,
    ) +
    outputWeight * output

  return Number.isFinite(cost) ? cost : null
}
