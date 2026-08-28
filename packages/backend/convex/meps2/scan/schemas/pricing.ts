import { z } from 'zod'

const looseObjectList = z.array(z.looseObject({}))

// meters are extra string keys on this object (prompt/completion plus image, cache, …).
// display_pricing and overrides are kept loosely; they also land on the pricing table.
export const Pricing = z
  .looseObject({
    prompt: z.string(),
    completion: z.string(),
    discount: z.number(),
    display_pricing: looseObjectList.optional(),
    overrides: looseObjectList.optional(),
  })
  .catchall(z.string())

export type Pricing = z.output<typeof Pricing>
