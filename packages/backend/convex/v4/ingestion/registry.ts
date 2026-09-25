import { ConvexError } from 'convex/values'

import * as listings from '../history/listings'
import * as pricing from '../history/pricing'
import type { ProcessorName } from './table'

/** Adding a processor opts it into new ingestions. Historical work is created explicitly. */
export const activeProcessors = ['pricing', 'listings'] as const

export function getProcessor(name: ProcessorName) {
  if (name === 'pricing') {
    return pricing
  }

  if (name === 'listings') {
    return listings
  }

  throw new ConvexError({ message: 'Processor is not registered', processor: name })
}
