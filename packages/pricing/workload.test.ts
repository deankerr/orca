import { describe, expect, it } from 'vitest'

import {
  defaultWorkload,
  isCostRaisedByNoCache,
  matchingPreset,
  workloadCost,
  workloadPresets,
} from './index'
import type { WorkloadRates } from './index'

const rates = (overrides: Partial<WorkloadRates> = {}): WorkloadRates => ({
  cacheRead: null,
  cacheWrite: null,
  input: 1,
  output: 5,
  ...overrides,
})

/** Three input tokens per output token with caching off: `0.75 × input + 0.25 × output`. */
const uncached = { hitRate: 0, ratio: 3 }

describe('workload cost without a cache', () => {
  it('weights input against output by the ratio', () => {
    expect(workloadCost(rates(), { hitRate: 0, ratio: 1 })).toBe(3)
    expect(workloadCost(rates(), { hitRate: 0, ratio: 3 })).toBe(2)
    expect(workloadCost(rates({ input: 2, output: 4 }), { hitRate: 0, ratio: 100 })).toBeCloseTo(
      (100 * 2 + 4) / 101,
    )
  })

  it('ignores the hit rate, since there is no cache to hit', () => {
    expect(workloadCost(rates(), { hitRate: 0.9, ratio: 3 })).toBe(2)
  })

  it('ignores a write rate when no read rate is quoted', () => {
    expect(workloadCost(rates({ cacheWrite: 1.25 }), { hitRate: 0.9, ratio: 3 })).toBe(2)
    expect(workloadCost(rates({ cacheWrite: 0 }), { hitRate: 0.9, ratio: 3 })).toBe(2)
  })
})

describe('workload cost with a cache', () => {
  const workload = { hitRate: 0.5, ratio: 1 }

  it('bills hits at the read rate and the rest at input when there is no write rate', () => {
    // inputCost = 0.5 × 0.1 + 0.5 × 1 = 0.55; (0.55 + 5) / 2
    expect(workloadCost(rates({ cacheRead: 0.1 }), workload)).toBeCloseTo(2.775)
  })

  it('lets a write rate above input replace the input rate for fresh tokens', () => {
    // inputCost = 0.5 × 0.1 + 0.5 × 1.25 = 0.675; (0.675 + 5) / 2
    expect(workloadCost(rates({ cacheRead: 0.1, cacheWrite: 1.25 }), workload)).toBeCloseTo(2.8375)
  })

  it('lets a write rate equal to input replace it, with the same result', () => {
    expect(workloadCost(rates({ cacheRead: 0.1, cacheWrite: 1 }), workload)).toBeCloseTo(2.775)
  })

  it('adds a write rate below input on top of it', () => {
    // fresh = 1 + 0.0833; inputCost = 0.5 × 0.1 + 0.5 × 1.0833 = 0.59165
    expect(workloadCost(rates({ cacheRead: 0.1, cacheWrite: 0.0833 }), workload)).toBeCloseTo(
      (0.59165 + 5) / 2,
    )
  })

  it('adds a free write meter on top of input as a no-op', () => {
    expect(workloadCost(rates({ cacheRead: 0.1, cacheWrite: 0 }), workload)).toBeCloseTo(2.775)
  })

  it('bills everything at the read rate at a hit rate of 1', () => {
    expect(
      workloadCost(rates({ cacheRead: 0.1, cacheWrite: 1.25 }), {
        hitRate: 1,
        ratio: 1,
      }),
    ).toBeCloseTo(2.55)
  })

  it('bills every input token at the input rate at a hit rate of 0, whatever the write rate', () => {
    expect(
      workloadCost(rates({ cacheRead: 0.1, cacheWrite: 1.25 }), {
        hitRate: 0,
        ratio: 1,
      }),
    ).toBe(3)
    expect(
      workloadCost(rates({ cacheRead: 0.1, cacheWrite: 0.0833 }), {
        hitRate: 0,
        ratio: 1,
      }),
    ).toBe(3)
    expect(workloadCost(rates({ cacheRead: 0.1 }), { hitRate: 0, ratio: 1 })).toBe(3)
  })

  it('treats a free cache read as a real rate', () => {
    expect(workloadCost(rates({ cacheRead: 0 }), { hitRate: 1, ratio: 1 })).toBe(2.5)
  })

  it('costs the agentic preset below the uncached input rate', () => {
    const cost = workloadCost(
      rates({ cacheRead: 0.1, cacheWrite: 1.25 }),
      workloadPresets[0].workload,
    )

    expect(cost).toBeCloseTo((100 * (0.9 * 0.1 + 0.1 * 1.25) + 5) / 101)
    expect(cost).toBeLessThan(workloadCost(rates(), workloadPresets[0].workload) ?? 0)
  })
})

describe('the 3:1 workload at a hit rate of 0', () => {
  it('reproduces 0.75 × input + 0.25 × output', () => {
    expect(workloadCost(rates({ input: 1, output: 5 }), uncached)).toBe(2)
    expect(workloadCost(rates({ input: 0.15, output: 0.6 }), uncached)).toBeCloseTo(0.2625)
    expect(workloadCost(rates({ cacheRead: 0.1 }), uncached)).toBe(2)
  })

  it('reproduces it on an endpoint whose write rate is 1.25× input', () => {
    const anthropic = rates({ cacheRead: 0.1, cacheWrite: 1.25 })

    expect(workloadCost(anthropic, uncached)).toBe(0.75 * 1 + 0.25 * 5)
    expect(workloadCost(anthropic, uncached)).toBe(workloadCost(rates(), uncached))
  })

  it('reproduces it on an endpoint whose write rate is below input', () => {
    expect(workloadCost(rates({ cacheRead: 0.1, cacheWrite: 0.0833 }), uncached)).toBe(2)
  })

  it('stays finite for huge finite rates', () => {
    expect(workloadCost(rates({ input: 1e308, output: 1e308 }), uncached)).toBe(1e308)
    expect(
      workloadCost(rates({ input: Number.MAX_VALUE, output: Number.MAX_VALUE }), uncached),
    ).toBe(Number.MAX_VALUE)
  })

  it('weights a zero rate like any other', () => {
    expect(workloadCost(rates({ input: 0, output: 4 }), uncached)).toBe(1)
    expect(workloadCost(rates({ input: 4, output: 0 }), uncached)).toBe(3)
  })
})

describe('workload cost at extreme rates', () => {
  const huge = { cacheRead: 1, cacheWrite: 1e308, input: 1.5e308, output: 1 }
  const agentic = { hitRate: 0.9, ratio: 100 }

  /** The cost relative to its expected value, which must be 1 to within rounding. */
  const relative = (cost: number | null, expected: number): number =>
    (cost ?? Number.NaN) / expected

  it('does not read the fresh rate at a hit rate of 1', () => {
    // Only the read rate and output are billed: 100/101 × 1 + 1/101 × 1.
    expect(workloadCost(rates(huge), { hitRate: 1, ratio: 100 })).toBeCloseTo(1, 12)
  })

  it('weights a surcharge write rate before adding it to input', () => {
    // 100/101 × 0.1 × (1.5e308 + 1e308) is representable, though the sum 2.5e308 is not.
    const expected = (100 / 101) * 0.1 * 1.5e308 + (100 / 101) * 0.1 * 1e308

    expect(Number.isFinite(workloadCost(rates(huge), agentic))).toBe(true)
    expect(relative(workloadCost(rates(huge), agentic), expected)).toBeCloseTo(1, 9)
  })

  it('weights a replacement write rate at or above input', () => {
    const replacement = {
      cacheRead: 1,
      cacheWrite: 1.7e308,
      input: 1.5e308,
      output: 1,
    }

    const equal = {
      cacheRead: 1,
      cacheWrite: 1.5e308,
      input: 1.5e308,
      output: 1,
    }

    expect(
      relative(workloadCost(rates(replacement), agentic), (100 / 101) * 0.1 * 1.7e308),
    ).toBeCloseTo(1, 9)
    expect(relative(workloadCost(rates(equal), agentic), (100 / 101) * 0.1 * 1.5e308)).toBeCloseTo(
      1,
      9,
    )
    expect(workloadCost(rates(replacement), { hitRate: 1, ratio: 100 })).toBeCloseTo(1, 12)
  })

  it('does not overflow when huge input is weighted by a hit rate and a ratio', () => {
    const cost = workloadCost(rates({ cacheRead: 0, input: Number.MAX_VALUE, output: 0 }), {
      hitRate: 0.5,
      ratio: 1,
    })

    expect(relative(cost, Number.MAX_VALUE / 4)).toBeCloseTo(1, 12)
  })

  it('is absent when the cost exceeds what a double can hold', () => {
    expect(
      workloadCost(rates({ input: Number.MAX_VALUE, output: Number.MAX_VALUE }), {
        hitRate: 0,
        ratio: 1,
      }),
    ).toBe(Number.MAX_VALUE)
    expect(
      workloadCost(
        rates({
          cacheRead: Number.MAX_VALUE,
          cacheWrite: Number.MAX_VALUE,
          output: Number.MAX_VALUE,
        }),
        { hitRate: 0.5, ratio: 1 },
      ),
    ).toBe(Number.MAX_VALUE)
    // A surcharge on top of input: 0.99 × (MAX + 0.9 × MAX) is about 1.88 × MAX.
    expect(
      workloadCost(
        rates({
          cacheRead: 0,
          cacheWrite: 0.9 * Number.MAX_VALUE,
          input: Number.MAX_VALUE,
          output: 0,
        }),
        { hitRate: 0.01, ratio: 1e9 },
      ),
    ).toBeNull()
  })
})

describe('workload cost of free and unpriced endpoints', () => {
  it('is zero when every rate is zero', () => {
    expect(workloadCost(rates({ input: 0, output: 0 }), uncached)).toBe(0)
    expect(
      workloadCost(rates({ cacheRead: 0, cacheWrite: 0, input: 0, output: 0 }), defaultWorkload),
    ).toBe(0)
  })

  it('is absent when input or output is absent', () => {
    expect(workloadCost(rates({ input: null }), uncached)).toBeNull()
    expect(workloadCost(rates({ output: null }), uncached)).toBeNull()
    expect(workloadCost(rates({ cacheRead: 0.1, input: null }), defaultWorkload)).toBeNull()
  })

  it('does not fall back to cache rates when input is absent', () => {
    expect(
      workloadCost(rates({ cacheRead: 0.1, cacheWrite: 1.25, input: null }), defaultWorkload),
    ).toBeNull()
  })
})

describe('isCostRaisedByNoCache', () => {
  const agentic = defaultWorkload

  it('is true with no read rate under a workload that uses a cache', () => {
    expect(isCostRaisedByNoCache(rates(), agentic)).toBe(true)
    expect(isCostRaisedByNoCache(rates(), { hitRate: 0.01, ratio: 3 })).toBe(true)
  })

  it('is true whatever the write rate, since a write rate without a read rate is ignored', () => {
    expect(isCostRaisedByNoCache(rates({ cacheWrite: 1.25 }), agentic)).toBe(true)
  })

  it('is false with a read rate, zero included', () => {
    expect(isCostRaisedByNoCache(rates({ cacheRead: 0.1 }), agentic)).toBe(false)
    expect(isCostRaisedByNoCache(rates({ cacheRead: 0 }), agentic)).toBe(false)
  })

  it('is false at a hit rate of 0, where no endpoint uses a cache', () => {
    expect(isCostRaisedByNoCache(rates(), uncached)).toBe(false)
    expect(isCostRaisedByNoCache(rates({ cacheRead: 0.1 }), uncached)).toBe(false)
  })

  it('is false for a free endpoint, whose cost a cache cannot change', () => {
    expect(isCostRaisedByNoCache(rates({ input: 0, output: 0 }), agentic)).toBe(false)
  })

  it('is true when only one of input and output is free', () => {
    expect(isCostRaisedByNoCache(rates({ input: 0 }), agentic)).toBe(true)
    expect(isCostRaisedByNoCache(rates({ output: 0 }), agentic)).toBe(true)
  })

  it('is false without a cost', () => {
    expect(isCostRaisedByNoCache(rates({ input: null }), agentic)).toBe(false)
    expect(isCostRaisedByNoCache(rates({ output: null }), agentic)).toBe(false)
  })
})

describe('presets', () => {
  it('start from agentic', () => {
    expect(defaultWorkload).toEqual({ hitRate: 0.9, ratio: 100 })
    expect(workloadPresets.map((preset) => preset.id)).toEqual(['agentic', 'chat', 'aa'])
  })

  it('are found by matching both numbers', () => {
    expect(matchingPreset({ hitRate: 0, ratio: 7 })?.id).toBe('chat')
    expect(matchingPreset({ hitRate: 0.78, ratio: 9 })?.label).toBe('AA blend')
    expect(matchingPreset(defaultWorkload)?.id).toBe('agentic')
  })

  it('leave 3:1 at 0% as a custom workload', () => {
    expect(matchingPreset(uncached)).toBeUndefined()
  })

  it('are not active when either number differs', () => {
    expect(matchingPreset({ hitRate: 0.9, ratio: 99 })).toBeUndefined()
    expect(matchingPreset({ hitRate: 0.8, ratio: 100 })).toBeUndefined()
  })
})
