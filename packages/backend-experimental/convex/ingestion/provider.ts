import { v } from 'convex/values'
import * as R from 'remeda'
import { z } from 'zod'

import { providerDataFields } from '../catalog/providers/table'
import { defineMutationSpec } from '../lib/functionSpec'
import { bumpVersion, commitMetadataValidator } from './shared'

// Drop nullish values so the catalog payload stays compact and stable.
function compact<T extends Record<string, unknown>>(value: T) {
  return R.pickBy(value, R.isNonNullish)
}

// Normalize one raw provider payload into the canonical catalog shape.
const rawProviderSchema = z
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
    const providerRecord = compact({
      id: raw.slug,
      name: raw.displayName,
      headquarters: raw.headquarters,
      datacenters: raw.datacenters,
      statusPageUrl: raw.statusPageUrl,
      termsOfServiceUrl: raw.dataPolicy.termsOfServiceURL,
      privacyPolicyUrl: raw.dataPolicy.privacyPolicyURL,
      sendClientIp: raw.sendClientIp,
    })

    return {
      id: providerRecord.id,
      providerRecord,
    }
  })

// Provider identity is stable enough that failures should halt collection.
const rawProviderIdentitySchema = z
  .object({
    slug: z.string(),
  })
  .transform((raw) => ({
    id: raw.slug,
  }))

export function parseProviderBundle(args: { item: Record<string, unknown> }) {
  return rawProviderSchema.parse(args.item)
}

export function parseProviderIdentity(args: { item: Record<string, unknown> }) {
  return rawProviderIdentitySchema.parse(args.item)
}

// Commit exactly one provider so the action can report parse and commit failures separately.
export const ingestProviders = defineMutationSpec({
  args: {
    ...commitMetadataValidator,
    entity: v.object({
      id: v.string(),
      providerRecord: v.object(providerDataFields),
    }),
  },
  handler: async (ctx, args) => {
    const providerWithVersion = await bumpVersion(ctx, {
      table: 'catalog_providers',
      id: args.entity.id,
      data: args.entity.providerRecord,
      firstSeenAt: args.firstSeenAt,
    })

    if (providerWithVersion) {
      await ctx.db.insert('catalog_providers', providerWithVersion)
    }

    return {
      changed: providerWithVersion !== null,
    }
  },
})
