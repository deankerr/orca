// * Queue payload: one scope to sample. Optional observedAt clusters a full-sample batch.
import * as Schema from 'effect/Schema'

export const WorkMessage = Schema.Struct({
  /** Shared storage time for a full-sample batch. */
  observedAt: Schema.optionalKey(Schema.NonEmptyString),
  permaslug: Schema.NonEmptyString,
  variant: Schema.NonEmptyString,
})
export type WorkMessage = Schema.Schema.Type<typeof WorkMessage>

export const decodeWorkMessage = Schema.decodeUnknownEffect(WorkMessage)

/** Crawlable models: serving endpoint present, skip `~` aliases. */
export const workList = (
  models: ReadonlyArray<{
    slug: string
    permaslug: string
    endpoint: { variant: string } | null
  }>,
  observedAt?: string,
): WorkMessage[] => {
  const out: WorkMessage[] = []
  for (const model of models) {
    if (model.endpoint === null || model.slug.startsWith('~')) {
      continue
    }
    out.push({
      permaslug: model.permaslug,
      variant: model.endpoint.variant,
      ...(observedAt === undefined ? {} : { observedAt }),
    })
  }
  return out
}
