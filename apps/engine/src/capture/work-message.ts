// * Queue payload: one scope to sample. No plan id, no batch — enqueue anytime.
import * as Schema from 'effect/Schema'

export const WorkMessage = Schema.Struct({
  permaslug: Schema.NonEmptyString,
  variant: Schema.NonEmptyString,
})
export type WorkMessage = Schema.Schema.Type<typeof WorkMessage>

export const decodeWorkMessage = Schema.decodeUnknownEffect(WorkMessage)

/** Models that still have a serving endpoint and are not `~` aliases. */
export const workList = (
  models: ReadonlyArray<{
    slug: string
    permaslug: string
    endpoint: { variant: string } | null
  }>,
): WorkMessage[] => {
  const out: WorkMessage[] = []
  for (const model of models) {
    if (model.endpoint === null || model.slug.startsWith('~')) {
      continue
    }
    out.push({ permaslug: model.permaslug, variant: model.endpoint.variant })
  }
  return out
}
