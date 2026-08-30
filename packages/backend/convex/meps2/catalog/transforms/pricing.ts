import { z } from 'zod'

const looseObjectList = z.array(z.looseObject({}))

// Named meters match the pricing table. Extra meters (internal_reasoning, …)
// stay as catchall strings on the file. display_pricing and overrides are
// kept loosely; they also land on the pricing table.
export const Pricing = z
  .looseObject({
    prompt: z.string(),
    completion: z.string(),
    discount: z.number(),

    image: z.string().optional(),
    image_output: z.string().optional(),

    input_cache_read: z.string().optional(),
    input_cache_write: z.string().optional(),
    input_cache_write_1h: z.string().optional(),

    audio: z.string().optional(),
    input_audio_cache: z.string().optional(),

    web_search: z.string().optional(),

    display_pricing: looseObjectList.optional(),
    overrides: looseObjectList.optional(),
  })
  .catchall(z.string())

export type Pricing = z.output<typeof Pricing>
