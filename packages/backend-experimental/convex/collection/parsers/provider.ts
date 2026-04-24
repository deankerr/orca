import * as R from 'remeda'
import { z } from 'zod'

// Drop nullish values so the catalog payload stays compact and stable.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw provider payload into the canonical catalog shape.
export const rawProviderTransformSchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    headquarters: z.string().optional(),
    datacenters: z
      .string()
      .array()
      .transform((value) => value.toSorted())
      .optional(),
    statusPageUrl: z.url().nullable(),
    dataPolicy: z.object({
      termsOfServiceURL: z.string().optional(),
      privacyPolicyURL: z.string().optional(),
    }),
    sendClientIp: z.boolean(),
  })
  .transform((raw) => {
    const id = raw.slug
    const name = raw.displayName

    const content = compact({
      id,
      name,
      headquarters: raw.headquarters,
      datacenters: raw.datacenters,
      statusPageUrl: raw.statusPageUrl,
      termsOfServiceUrl: raw.dataPolicy.termsOfServiceURL,
      privacyPolicyUrl: raw.dataPolicy.privacyPolicyURL,
      sendClientIp: raw.sendClientIp,
    })

    return {
      entity: {
        id,
        label: name,
      },
      content,
    }
  })

export const rawProviderIdentitySchema = z
  .looseObject({
    slug: z.string(),
  })
  .transform((raw) => ({
    id: raw.slug,
    rawProvider: raw,
  }))
