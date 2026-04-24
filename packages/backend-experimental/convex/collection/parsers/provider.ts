import * as R from 'remeda'
import { z } from 'zod'

// Drop nullish values so the catalog payload stays compact and stable.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw provider payload into the canonical catalog shape.
export const rawProviderTransformSchema = z
  .object({
    dataPolicy: z.object({
      privacyPolicyURL: z.string().optional(),
      termsOfServiceURL: z.string().optional(),
    }),
    datacenters: z
      .string()
      .array()
      .transform((value) => value.toSorted())
      .optional(),
    displayName: z.string(),
    headquarters: z.string().optional(),
    sendClientIp: z.boolean(),
    slug: z.string(),
    statusPageUrl: z.url().nullable(),
  })
  .transform((raw) => {
    const id = raw.slug
    const name = raw.displayName

    const content = compact({
      datacenters: raw.datacenters,
      headquarters: raw.headquarters,
      id,
      name,
      privacyPolicyUrl: raw.dataPolicy.privacyPolicyURL,
      sendClientIp: raw.sendClientIp,
      statusPageUrl: raw.statusPageUrl,
      termsOfServiceUrl: raw.dataPolicy.termsOfServiceURL,
    })

    return {
      content,
      entity: {
        id,
        label: name,
      },
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
