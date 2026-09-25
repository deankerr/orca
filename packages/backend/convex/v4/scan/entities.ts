import { z } from 'zod'

import { IdentifiedModel } from '../../scan/schema'

/** Model body with the variant-aware identity supplied by its scan entry. */
export const Model = IdentifiedModel.extend({ id: z.string(), variant: z.string() }).catchall(
  z.json(),
)

/** Embedded provider body before assigning its neutral entity identity. */
export const ProviderBody = z.object({ slug: z.string() }).catchall(z.json())

/** Assembled provider identity, with the ambiguous upstream name removed. */
export const Provider = z.object({ provider_id: z.string() }).catchall(z.json())

/** Endpoint body with explicit relationships; all other source facts remain available to consumers. */
export const Endpoint = z
  .object({
    id: z.string(),
    variant: z.string(),
    model_id: z.string(),
    provider_id: z.string(),
    provider_tag: z.string(),
    model_variant_slug: z.string(),
  })
  .catchall(z.json())

export type Model = z.infer<typeof Model>
export type Provider = z.infer<typeof Provider>
export type Endpoint = z.infer<typeof Endpoint>
