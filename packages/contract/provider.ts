import { z } from 'zod'

// Contract fields are always present; null means ORCA does not know the fact.
const url = (description: string) => z.url().nullable().meta({ description })

export const Provider = z
  .object({
    byok_enabled: z
      .boolean()
      .nullable()
      .meta({ description: 'Accepts bring-your-own-key requests.' }),
    datacenters: z
      .array(z.string())
      .nullable()
      .meta({ description: 'Upstream datacenter country codes.', example: ['US'] }),
    display_name: z.string().meta({
      description: 'Upstream display name, which can differ from `name`.',
      example: 'Google Vertex',
    }),
    headquarters: z
      .string()
      .nullable()
      .meta({ description: 'Upstream headquarters country code.', example: 'US' }),
    id: z.string().meta({ description: 'ORCA-normalized provider slug.', example: 'deepinfra' }),
    listed_endpoints: z.number().int().nonnegative().meta({
      description: 'Listed endpoints; zero while none is listed.',
    }),
    listed_models: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Models with a listed endpoint from this provider.' }),
    name: z.string().meta({ description: 'Upstream provider name.', example: 'Google' }),
    privacy_policy_url: url('Provider privacy policy.'),
    status_page_url: url('Provider status page.'),
    terms_of_service_url: url('Provider terms of service.'),
  })
  .meta({ description: 'A model-serving service.', id: 'Provider' })

export type Provider = z.infer<typeof Provider>
