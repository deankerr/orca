import { paginationOptsValidator, PaginationResult } from 'convex/server'

import type { Doc, TableNames } from './_generated/dataModel'
import type { ActionCtx, MutationCtx } from './_generated/server'
import { OrcaEndpoint } from './transforms/endpoint'

// * Pricing Formatter
// Transforms raw pricing values (dollar per unit) into display format.
// Returns { value, unit } for flexible display: `${value}${unit}` -> "$1.23/MTOK"
// Handles untyped keys gracefully - unknown keys return raw value with blank unit.

export type PricingFormatResult = {
  value: string
  unit: string
}

type PricingFormat = {
  transform: (value: number) => number
  unit: string
}

type PricingKey = keyof Omit<OrcaEndpoint['pricing'], 'tiers'>

// Canonical pricing keys from PricingOutputSchema (convex/transforms/endpoint.ts)
const pricingFormats: Record<PricingKey, PricingFormat> = {
  // Per-token pricing (display per million tokens)
  text_input: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  text_output: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  text_cache_read: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  text_cache_write: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  reasoning_output: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  audio_input: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  audio_cache_write: { transform: (v) => v * 1_000_000, unit: '/MTOK' },

  // Per-image pricing (display per thousand images)
  image_input: { transform: (v) => v * 1_000, unit: '/1K IMG' },
  image_output: { transform: (v) => v * 1_000, unit: '/1K IMG' },

  // Per-request pricing
  per_request: { transform: (v) => v, unit: '/REQ' },
}

/**
 * Format a pricing value for display.
 *
 * @param key - Pricing key (e.g., "text_input"). If unrecognized, returns raw value.
 * @param value - Raw pricing value (number or numeric string). Dollar value per unit.
 * @returns { value: string, unit: string } or null if inputs are null.
 *
 * Usage: `${result.value}${result.unit}` -> "$1.23/MTOK"
 */
export function formatPricing(
  key: string | null,
  value: number | string | null,
): PricingFormatResult | null {
  if (key === null || value === null) return null

  // * coerce string to number
  const numericValue = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numericValue)) {
    return { value: String(value), unit: '' }
  }

  const format = pricingFormats[key as PricingKey]
  if (!format) {
    // Unknown key - return raw value formatted as number
    return { value: String(numericValue), unit: '' }
  }

  const transformedValue = format.transform(numericValue)
  const formatted = transformedValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })

  return {
    value: `$${formatted}`,
    unit: format.unit,
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Abnormal Error'
}

/**
 * Utility function to paginate through a table and process each page of results.
 * This abstracts the common pattern of fetching paginated data and processing it.
 *
 * @param ctx - The Convex context (ActionCtx, MutationCtx, or QueryCtx)
 * @param args - Configuration object containing queryFnArgs, queryFn, processFn, and optional batchSize
 *
 * The processFn can return false to signal early termination of pagination.
 * Returning void, undefined, or true will continue pagination.
 */
export async function paginateAndProcess<T extends Doc<TableNames>>(
  ctx: ActionCtx | MutationCtx,
  args: {
    queryFnArgs: Record<string, any>
    queryFn: (
      ctx: ActionCtx | MutationCtx,
      args: { paginationOpts: typeof paginationOptsValidator.type } & Record<string, any>,
    ) => Promise<PaginationResult<T>>
    processFn: (items: T[]) => Promise<void | boolean>
    batchSize: number
  },
): Promise<void> {
  const { queryFnArgs, queryFn, processFn, batchSize } = args

  let cursor: string | null = null

  while (true) {
    const results = await queryFn(ctx, {
      ...queryFnArgs,
      paginationOpts: {
        numItems: batchSize,
        cursor,
      },
    })

    if (results.page.length === 0) {
      break
    }

    const shouldContinue = await processFn(results.page)

    if (shouldContinue === false) {
      break
    }

    if (results.isDone) {
      break
    }

    cursor = results.continueCursor
  }
}
