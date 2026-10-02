import { z } from 'zod'

/** Official model identities mapped to the existing archive and frontend stats contract. */
export const TopAppsTargets = z
  .object({
    data: z.array(
      z.object({
        id: z.string().regex(/^[^:\s]+(?::[^:\s]+)?$/),
        canonical_slug: z.string().min(1),
      }),
    ),
  })
  .transform(({ data }) =>
    data
      // Match scan collection: latest aliases duplicate canonical model targets.
      .filter((model) => !model.id.startsWith('~'))
      .map((model) => ({
        slug: model.id,
        version_slug: model.canonical_slug,
        variant: model.id.split(':')[1] ?? 'standard',
      })),
  )
