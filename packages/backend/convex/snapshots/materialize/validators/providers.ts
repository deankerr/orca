import * as R from 'remeda'
import { z } from 'zod'

export const ProviderTransformSchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    icon: z.object({
      url: z.string(),
    }),

    headquarters: z.string().nullish(),
    datacenters: z
      .string()
      .array()
      .transform((arr) => arr.sort())
      .nullish(),
    statusPageUrl: z.url().nullish(),

    dataPolicy: z.object({
      termsOfServiceURL: z.string().optional(),
      privacyPolicyURL: z.string().optional(),
    }),
  })
  .transform(R.pickBy(R.isNonNullish))
  .transform((raw) => ({
    slug: raw.slug,
    name: raw.displayName,
    icon_url: '', // deprecated

    headquarters: raw.headquarters,
    datacenters: raw.datacenters,
    status_page_url: raw.statusPageUrl,
    terms_of_service_url: raw.dataPolicy.termsOfServiceURL,
    privacy_policy_url: raw.dataPolicy.privacyPolicyURL,
  }))
